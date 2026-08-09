"""PRD §12/§48/§49 — loopback istemci tespiti ve /api/pair erisim kisiti."""

from __future__ import annotations


class TestHealthLocalClient:
    def test_loopback_istemci_true(self, client) -> None:
        body = client.get("/api/health").json()
        assert body["is_local_client"] is True

    def test_lan_istemci_false(self, lan_client) -> None:
        body = lan_client.get("/api/health").json()
        assert body["is_local_client"] is False

    def test_forwarded_basligi_spoof_edemez(self, lan_client) -> None:
        """Proxy basliklari dikkate alinmaz; yalnizca gercek soket adresi sayilir."""
        for headers in (
            {"X-Forwarded-For": "127.0.0.1"},
            {"X-Real-IP": "127.0.0.1"},
            {"Forwarded": "for=127.0.0.1"},
            {"X-Forwarded-For": "127.0.0.1", "Host": "127.0.0.1:8765"},
        ):
            body = lan_client.get("/api/health", headers=headers).json()
            assert body["is_local_client"] is False, headers


class TestPairLoopbackOnly:
    def test_loopback_kod_uretebilir(self, client) -> None:
        assert client.post("/api/pair").status_code == 200

    def test_lan_kod_uretemez(self, lan_client) -> None:
        response = lan_client.post("/api/pair")
        assert response.status_code == 403
        detail = response.json()["detail"]
        assert "eslestirme" in detail.lower()

    def test_lan_spoof_basligiyla_da_uretemez(self, lan_client) -> None:
        response = lan_client.post("/api/pair", headers={"X-Forwarded-For": "127.0.0.1"})
        assert response.status_code == 403

    def test_confirm_lan_istemciden_calisir(self, client, lan_client) -> None:
        """Regresyon: telefon her zaman aglar uzerinden confirm edebilmelidir."""
        code = client.post("/api/pair").json()["code"]
        response = lan_client.post(
            "/api/pair/confirm", json={"code": code, "device_name": "iPhone LAN"}
        )
        assert response.status_code == 200, response.text
        assert response.json()["token"]
