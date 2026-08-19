"""PRD §12/§44/§47/§48 — telefonun erisebilecegi adreslerin tespiti."""

from __future__ import annotations

from phoneshare_receiver.core import addresses


class TestSiniflandirma:
    def test_tailscale_araligi(self) -> None:
        assert addresses.is_tailscale_ipv4("100.89.62.116")
        assert not addresses.is_tailscale_ipv4("100.200.1.1")
        assert not addresses.is_tailscale_ipv4("192.168.1.180")

    def test_sanal_adaptor_tespiti(self) -> None:
        # WSL2 / Hyper-V vEthernet — makinede var ama telefondan ERISILEMEZ.
        assert addresses.is_virtual_ipv4("172.23.208.1")
        assert addresses.is_virtual_ipv4("192.168.56.1")
        assert not addresses.is_virtual_ipv4("192.168.1.180")

    def test_url_uretimi(self) -> None:
        assert addresses.build_url("192.168.1.180", 8765, "http") == "http://192.168.1.180:8765"
        assert addresses.build_url("fe80::1", 8765, "http") == "http://[fe80::1]:8765"
        assert addresses.build_url("pc.ts.net", 443, "https") == "https://pc.ts.net"

    def test_pair_kodu_eklenir(self) -> None:
        url = addresses.with_pair_code("http://192.168.1.180:8765", "482-193")
        assert url == "http://192.168.1.180:8765/?pair=482-193"

    def test_tailscale_status_json(self) -> None:
        raw = '{"Self":{"TailscaleIPs":["100.89.62.116"],"DNSName":"umut-pc.tail1.ts.net."}}'
        assert addresses.parse_tailscale_status(raw) == ("100.89.62.116", "umut-pc.tail1.ts.net")
        assert addresses.parse_tailscale_status("bozuk") == (None, None)
        assert addresses.parse_tailscale_status("{}") == (None, None)


class TestAdresTespiti:
    def test_wsl_arayuzu_elenir_lan_secilir(self) -> None:
        result = addresses.detect_addresses(
            port=8765,
            scheme="http",
            interfaces=["172.23.208.1", "192.168.1.180"],
        )
        hosts = [item.host for item in result]
        assert "172.23.208.1" not in hosts
        assert hosts[0] == "192.168.1.180"
        assert result[0].kind == "lan"
        assert result[0].url == "http://192.168.1.180:8765"
        assert result[0].reachable_from_phone is True

    def test_varsayilan_rota_adresi_once_gelir(self) -> None:
        result = addresses.detect_addresses(
            port=8765,
            scheme="http",
            interfaces=["10.5.0.7", "192.168.1.180"],
            primary="10.5.0.7",
        )
        assert [item.host for item in result][0] == "10.5.0.7"

    def test_siralama_lan_tailscale_loopback(self) -> None:
        result = addresses.detect_addresses(
            port=8765,
            scheme="http",
            interfaces=["100.89.62.116", "192.168.1.180", "172.23.208.1"],
            tailscale_dns="umut-pc.tail1.ts.net",
        )
        kinds = [item.kind for item in result]
        assert kinds == ["lan", "tailscale", "tailscale", "loopback"]
        assert [item.host for item in result] == [
            "192.168.1.180",
            "umut-pc.tail1.ts.net",
            "100.89.62.116",
            "127.0.0.1",
        ]
        best = addresses.best_address(result)
        assert best is not None and best.host == "192.168.1.180"

    def test_lan_yoksa_tailscale_secilir(self) -> None:
        result = addresses.detect_addresses(
            port=8765, scheme="http", interfaces=["100.89.62.116"]
        )
        best = addresses.best_address(result)
        assert best is not None
        assert best.kind == "tailscale"
        assert best.url == "http://100.89.62.116:8765"

    def test_hic_lan_yokken_loopback_erisilemez_isaretlenir(self) -> None:
        result = addresses.detect_addresses(port=8765, scheme="http", interfaces=[])
        assert len(result) == 1
        assert result[0].kind == "loopback"
        assert result[0].host == "127.0.0.1"
        assert result[0].reachable_from_phone is False
        best = addresses.best_address(result)
        assert best is not None and best.kind == "loopback"

    def test_tailscale_ipv4_ayri_eklenir_ve_tekillestirilir(self) -> None:
        result = addresses.detect_addresses(
            port=8765,
            scheme="http",
            interfaces=["192.168.1.180", "100.89.62.116"],
            tailscale_dns="umut-pc.tail1.ts.net",
            tailscale_ipv4="100.89.62.116",
        )
        hosts = [item.host for item in result]
        assert hosts.count("100.89.62.116") == 1

    def test_tls_https_semasi(self) -> None:
        result = addresses.detect_addresses(
            port=8765, scheme="https", interfaces=["192.168.1.180"]
        )
        assert result[0].url == "https://192.168.1.180:8765"
        assert addresses.scheme_for("cert.pem", "key.pem") == "https"
        assert addresses.scheme_for(None, None) == "http"
        assert addresses.scheme_for("cert.pem", None) == "http"


class TestCurrentAddresses:
    def test_config_portunu_kullanir(self, config, monkeypatch) -> None:
        addresses.reset_cache()
        monkeypatch.setattr(addresses, "local_ipv4_interfaces", lambda: ["192.168.1.180"])
        monkeypatch.setattr(addresses, "primary_ipv4", lambda: "192.168.1.180")
        monkeypatch.setattr(addresses, "tailscale_self", lambda: (None, None))
        config.port = 8765

        result = addresses.current_addresses(config)
        assert result[0].url == "http://192.168.1.180:8765"

        # Onbellek: ikinci cagri sistem sorgusu yapmadan ayni sonucu verir.
        monkeypatch.setattr(addresses, "local_ipv4_interfaces", lambda: ["10.0.0.5"])
        assert addresses.current_addresses(config)[0].host == "192.168.1.180"
        addresses.reset_cache()

    def test_getaddrinfo_atlasa_bile_tailscale_ip_gorunur(self, config, monkeypatch) -> None:
        # Kok sebep testi: getaddrinfo Tailscale adaptorunu atlasa bile
        # `tailscale status --json` cikan IPv4, adres listesinde yer almali.
        addresses.reset_cache()
        monkeypatch.setattr(addresses, "local_ipv4_interfaces", lambda: ["192.168.1.180"])
        monkeypatch.setattr(addresses, "primary_ipv4", lambda: "192.168.1.180")
        monkeypatch.setattr(
            addresses, "tailscale_self", lambda: ("100.89.62.116", "umut-pc.tail1.ts.net")
        )
        config.port = 8765

        result = addresses.current_addresses(config)
        hosts = [item.host for item in result]
        assert "100.89.62.116" in hosts
        assert "umut-pc.tail1.ts.net" in hosts
        kinds = {item.host: item.kind for item in result}
        assert kinds["100.89.62.116"] == "tailscale"
        addresses.reset_cache()
