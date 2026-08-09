"""mDNS/Zeroconf yayini: telefon LAN'da `_phoneshare._tcp` ile agent'i bulur."""

from __future__ import annotations

import socket
from typing import Any

from .. import __version__
from ..core.logging_setup import get_logger

log = get_logger("system")

SERVICE_TYPE = "_phoneshare._tcp.local."


def _local_ips() -> list[bytes]:
    ips: list[bytes] = []
    try:
        # Disari cikan arayuzun IP'sini bulmak icin baglanti kurmadan UDP soketi.
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ips.append(socket.inet_aton(sock.getsockname()[0]))
        sock.close()
    except OSError:
        pass
    if not ips:
        try:
            ips.append(socket.inet_aton(socket.gethostbyname(socket.gethostname())))
        except OSError:
            ips.append(socket.inet_aton("127.0.0.1"))
    return ips


class Discovery:
    """Zeroconf servis kaydini yonetir; paket yoksa sessizce devre disi kalir."""

    def __init__(self, port: int, name: str = "PhoneShare Agent", tls: bool = False) -> None:
        self.port = port
        self.name = name
        self.tls = tls
        self._zc: Any = None
        self._info: Any = None

    def start(self) -> bool:
        try:
            from zeroconf import ServiceInfo, Zeroconf
        except ImportError:
            log.warning("zeroconf yok; mDNS yayini kapali", extra={"category": "system"})
            return False
        try:
            safe = self.name.replace(".", "-")
            self._info = ServiceInfo(
                SERVICE_TYPE,
                f"{safe}.{SERVICE_TYPE}",
                addresses=_local_ips(),
                port=self.port,
                properties={
                    "version": __version__,
                    "scheme": "https" if self.tls else "http",
                    "api": "/v1",
                },
                server=f"{socket.gethostname().replace('.', '-')}.local.",
            )
            self._zc = Zeroconf()
            self._zc.register_service(self._info)
            log.info("mDNS yayini baslatildi", extra={"category": "system", "port": self.port})
            return True
        except Exception as exc:
            log.warning("mDNS baslatilamadi", extra={"category": "system", "error": str(exc)})
            self.stop()
            return False

    def stop(self) -> None:
        try:
            if self._zc is not None and self._info is not None:
                self._zc.unregister_service(self._info)
            if self._zc is not None:
                self._zc.close()
        except Exception:
            pass
        finally:
            self._zc = None
            self._info = None
