"""Telefonun erisebilecegi receiver adreslerinin tespiti (PRD §12/§44/§47/§48).

Neden ayri modul: eslestirme URL'i ASLA istemcinin gordugu `request.base_url`'den
turetilmemelidir. Panel `127.0.0.1` uzerinden cagirir, ters vekil/eski sekme yanlis
port tasiyabilir; ikisinde de telefonun ulasamayacagi bir adres uretilir.

Burada receiver KENDI dinledigi portu (`cfg.port`) ve makinenin gercek ag
arayuzlerini kullanarak aday adresleri uretir. Fonksiyonlar saftir; arayuz listesi
disaridan enjekte edilebilir (test edilebilirlik).
"""

from __future__ import annotations

import ipaddress
import json
import socket
import subprocess
import time
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

#: Adres sinifi — sıralama LAN > Tailscale > loopback (PRD §47/§48).
KIND_LAN = "lan"
KIND_TAILSCALE = "tailscale"
KIND_LOOPBACK = "loopback"

_KIND_ORDER = {KIND_LAN: 0, KIND_TAILSCALE: 1, KIND_LOOPBACK: 2}

_LABELS = {
    KIND_LAN: "Yerel ag (ayni Wi-Fi)",
    KIND_TAILSCALE: "Tailscale (uzaktan erisim)",
    KIND_LOOPBACK: "Yalnizca bu bilgisayar",
}

#: Tailscale CGNAT araligi.
_TAILSCALE_NET = ipaddress.ip_network("100.64.0.0/10")

#: Ozel (LAN) araliklar — telefonun ayni agda erisebilecegi adresler.
_PRIVATE_NETS = (
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
)

#: WSL / Hyper-V / VirtualBox sanal adaptorleri: makinede vardir ama telefondan
#: ERISILEMEZ. Windows'ta WSL2 ve Hyper-V vEthernet daima 172.16.0.0/12 verir.
_VIRTUAL_NETS = (
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.56.0/24"),  # VirtualBox host-only
)


@dataclass(frozen=True, slots=True)
class ReceiverAddress:
    """Panele/telefona gosterilecek tek bir aday adres."""

    url: str
    host: str
    kind: str
    reachable_from_phone: bool
    label: str

    def to_dict(self) -> dict:
        return {
            "url": self.url,
            "host": self.host,
            "kind": self.kind,
            "reachable_from_phone": self.reachable_from_phone,
            "label": self.label,
        }


# --------------------------------------------------------------------- #
# Saf yardimcilar                                                        #
# --------------------------------------------------------------------- #


def build_url(host: str, port: int, scheme: str) -> str:
    """`scheme://host:port` — IPv6 host'lari koseli parantezle sarilir."""
    bracketed = f"[{host}]" if ":" in host else host
    if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
        return f"{scheme}://{bracketed}"
    return f"{scheme}://{bracketed}:{port}"


def with_pair_code(url: str, code: str) -> str:
    """Eslestirme URL'i: `<url>/?pair=<code>` (PRD §12)."""
    base = url.rstrip("/")
    return f"{base}/?pair={code}"


def _parse_ipv4(value: str) -> ipaddress.IPv4Address | None:
    try:
        parsed = ipaddress.ip_address(value.strip())
    except ValueError:
        return None
    return parsed if isinstance(parsed, ipaddress.IPv4Address) else None


def is_tailscale_ipv4(value: str) -> bool:
    ip = _parse_ipv4(value)
    return ip is not None and ip in _TAILSCALE_NET


def is_private_ipv4(value: str) -> bool:
    ip = _parse_ipv4(value)
    return ip is not None and any(ip in net for net in _PRIVATE_NETS)


def is_virtual_ipv4(value: str) -> bool:
    """WSL/Hyper-V/VirtualBox sanal adaptor adresi mi? (ornek: 172.23.208.1)"""
    ip = _parse_ipv4(value)
    return ip is not None and any(ip in net for net in _VIRTUAL_NETS)


def _lan_rank(value: str) -> int:
    """Kucuk olan tercih edilir: ev/ofis aglari once, sanal adaptorler en sonda."""
    ip = _parse_ipv4(value)
    if ip is None:
        return 9
    if ip in _PRIVATE_NETS[0]:  # 192.168/16
        return 1
    if ip in _PRIVATE_NETS[1]:  # 10/8
        return 2
    if ip in _PRIVATE_NETS[2]:  # 172.16/12 — cogunlukla sanal
        return 3
    return 9


def parse_tailscale_status(raw: str) -> tuple[str | None, str | None]:
    """`tailscale status --json` ciktisindan (ipv4, MagicDNS adi). Bozuksa (None, None)."""
    try:
        value = json.loads(raw)
    except (ValueError, TypeError):
        return (None, None)
    if not isinstance(value, dict):
        return (None, None)
    node = value.get("Self")
    if not isinstance(node, dict):
        return (None, None)
    ips = node.get("TailscaleIPs")
    ipv4 = None
    if isinstance(ips, list):
        for item in ips:
            if isinstance(item, str) and _parse_ipv4(item) is not None:
                ipv4 = item
                break
    dns = node.get("DNSName")
    dns_name = dns.rstrip(".").strip() if isinstance(dns, str) else None
    return (ipv4, dns_name or None)


def detect_addresses(
    *,
    port: int,
    scheme: str = "http",
    interfaces: Sequence[str] = (),
    primary: str | None = None,
    tailscale_dns: str | None = None,
) -> list[ReceiverAddress]:
    """Aday adresleri sirali dondurur: LAN > Tailscale > loopback.

    - `interfaces`: makinedeki IPv4 adresleri (enjekte edilebilir).
    - `primary`: varsayilan rota uzerindeki IPv4 (UDP connect hilesi); varsa LAN
      adaylari arasinda daima ilk siraya alinir.
    - `tailscale_dns`: MagicDNS adi (`*.ts.net`); varsa 100.x IPv4'ten once gelir.

    Loopback her zaman son adaydir ve `reachable_from_phone=False` ile isaretlenir.
    """
    candidates: list[str] = []
    for raw in (primary, *interfaces):
        if not raw:
            continue
        host = raw.strip()
        if host and host not in candidates:
            candidates.append(host)

    lan = [h for h in candidates if is_private_ipv4(h) and not is_tailscale_ipv4(h)]
    # Sanal adaptorler (WSL/Hyper-V) telefondan ERISILEMEZ: gercek bir LAN adresi
    # varsa tamamen elenir. Baska hicbir aday yoksa da listeye alinmaz — yanlis
    # adres gostermek, adres gostermemekten daha kotudur.
    real_lan = [h for h in lan if not is_virtual_ipv4(h) or h == primary]
    lan = real_lan
    lan.sort(key=lambda h: (0 if h == primary else 1, _lan_rank(h), h))

    tailscale: list[str] = []
    if tailscale_dns:
        tailscale.append(tailscale_dns)
    tailscale.extend(h for h in candidates if is_tailscale_ipv4(h))

    results: list[ReceiverAddress] = []
    for host in lan:
        results.append(_address(host, port, scheme, KIND_LAN, True))
    for host in tailscale:
        results.append(_address(host, port, scheme, KIND_TAILSCALE, True))
    results.append(_address("127.0.0.1", port, scheme, KIND_LOOPBACK, False))

    results.sort(key=lambda item: _KIND_ORDER.get(item.kind, 9))
    return results


def _address(host: str, port: int, scheme: str, kind: str, reachable: bool) -> ReceiverAddress:
    return ReceiverAddress(
        url=build_url(host, port, scheme),
        host=host,
        kind=kind,
        reachable_from_phone=reachable,
        label=_LABELS[kind],
    )


def best_address(addresses: Iterable[ReceiverAddress]) -> ReceiverAddress | None:
    """QR'a yazilacak adres: telefonun erisebilecegi ilk aday (LAN > Tailscale)."""
    ordered = list(addresses)
    for item in ordered:
        if item.reachable_from_phone:
            return item
    return ordered[0] if ordered else None


# --------------------------------------------------------------------- #
# Sistem sorgulari (saf degil; yukaridaki fonksiyonlara girdi uretir)     #
# --------------------------------------------------------------------- #


def primary_ipv4() -> str | None:
    """Varsayilan rotanin kaynak IPv4'u. Paket GONDERILMEZ; ag yoksa None doner."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            sock.connect(("8.8.8.8", 80))
            host = sock.getsockname()[0]
        finally:
            sock.close()
    except OSError:
        return None
    ip = _parse_ipv4(host)
    if ip is None or ip.is_loopback or ip.is_unspecified:
        return None
    return str(ip)


def local_ipv4_interfaces() -> list[str]:
    """Makinedeki IPv4 adresleri (loopback/link-local haric)."""
    hosts: list[str] = []
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, family=socket.AF_INET)
    except OSError:
        return hosts
    for info in infos:
        host = info[4][0]
        ip = _parse_ipv4(host)
        if ip is None or ip.is_loopback or ip.is_link_local or ip.is_unspecified:
            continue
        if host not in hosts:
            hosts.append(host)
    return hosts


# Windows'ta konsol tabanli araci GUI oturumundan calistirinca kisa omurlu bir
# konsol penceresi acilir; periyodik cagrida ekranda yanip sonen pencere olur.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def tailscale_dns_name() -> str | None:
    """Kuruluysa MagicDNS adi. Tailscale yoksa/yavassa sessizce None doner."""
    try:
        completed = subprocess.run(  # noqa: S603 - sabit komut, kullanici girdisi yok
            ["tailscale", "status", "--json"],  # noqa: S607
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
            stdin=subprocess.DEVNULL,
            creationflags=_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    _, dns = parse_tailscale_status(completed.stdout)
    return dns


def scheme_for(tls_certfile: str | None, tls_keyfile: str | None) -> str:
    return "https" if tls_certfile and tls_keyfile else "http"


_CACHE: dict[str, object] = {"key": None, "at": 0.0, "value": []}
_CACHE_TTL_SEC = 20.0


def current_addresses(config, *, ttl_sec: float = _CACHE_TTL_SEC) -> list[ReceiverAddress]:
    """Yapilandirmadaki GERCEK port/scheme ile aday adresler (kisa sureli onbellek).

    `/api/health` sik cagrildigi icin sistem sorgulari (ozellikle `tailscale`
    surec cagrisi) `ttl_sec` boyunca onbelleklenir.
    """
    scheme = scheme_for(config.tls_certfile, config.tls_keyfile)
    key = f"{config.port}|{scheme}"
    now = time.monotonic()
    if _CACHE["key"] == key and now - float(_CACHE["at"]) < ttl_sec:  # type: ignore[arg-type]
        return list(_CACHE["value"])  # type: ignore[arg-type]

    addresses = detect_addresses(
        port=int(config.port),
        scheme=scheme,
        interfaces=local_ipv4_interfaces(),
        primary=primary_ipv4(),
        tailscale_dns=tailscale_dns_name(),
    )
    _CACHE["key"] = key
    _CACHE["at"] = now
    _CACHE["value"] = addresses
    return list(addresses)


def reset_cache() -> None:
    """Testler ve ayar degisiklikleri icin onbellegi bosaltir."""
    _CACHE["key"] = None
    _CACHE["at"] = 0.0
    _CACHE["value"] = []
