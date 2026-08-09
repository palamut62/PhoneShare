"""PRD §12/§13/§49/§83 — eslestirme, kimlik dogrulama, brute force, denetim kaydi."""

from __future__ import annotations

import re

from sqlalchemy import select

from phoneshare_receiver.models import AuditLog, Device
from phoneshare_receiver.security.tokens import hash_token


class TestPairing:
    def test_kod_formati_ve_ttl(self, client) -> None:
        response = client.post("/api/pair")
        assert response.status_code == 200
        body = response.json()
        assert re.fullmatch(r"\d{3}-\d{3}", body["code"])
        assert body["expires_at"]
        assert '"code"' in body["qr_payload"]

    def test_confirm_token_uretir(self, client) -> None:
        code = client.post("/api/pair").json()["code"]
        response = client.post(
            "/api/pair/confirm", json={"code": code, "device_name": "iPhone 15"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["device_id"] and body["token"]
        assert body["device_name"] == "iPhone 15"

    def test_cookie_ile_oturum_geri_yuklenir(self, client) -> None:
        code = client.post("/api/pair").json()["code"]
        response = client.post(
            "/api/pair/confirm", json={"code": code, "device_name": "iPhone PWA"}
        )
        assert response.status_code == 200
        assert "phoneshare_session=" in response.headers["set-cookie"]
        assert "HttpOnly" in response.headers["set-cookie"]

        restored = client.get("/api/session")
        assert restored.status_code == 200
        assert restored.json() == {
            "device_id": response.json()["device_id"],
            "device_name": "iPhone PWA",
        }

    def test_kod_tek_kullanimliktir(self, client) -> None:
        code = client.post("/api/pair").json()["code"]
        first = client.post("/api/pair/confirm", json={"code": code, "device_name": "A"})
        assert first.status_code == 200
        again = client.post("/api/pair/confirm", json={"code": code, "device_name": "B"})
        assert again.status_code == 403

    def test_kod_bosluk_ve_tiresiz_kabul(self, client) -> None:
        code = client.post("/api/pair").json()["code"]
        response = client.post(
            "/api/pair/confirm", json={"code": code.replace("-", ""), "device_name": "iPhone"}
        )
        assert response.status_code == 200

    def test_gecersiz_kod_reddedilir(self, client) -> None:
        client.post("/api/pair")
        response = client.post(
            "/api/pair/confirm", json={"code": "000-000", "device_name": "Saldirgan"}
        )
        assert response.status_code == 403
        assert "gecersiz" in response.json()["message"].lower()

    def test_brute_force_oturumu_yakar(self, client) -> None:
        """PRD §83 — art arda yanlis denemeden sonra dogru kod bile calismaz."""
        code = client.post("/api/pair").json()["code"]
        for _ in range(5):
            client.post("/api/pair/confirm", json={"code": "111-111", "device_name": "X"})
        response = client.post("/api/pair/confirm", json={"code": code, "device_name": "X"})
        assert response.status_code == 403

    def test_ip_hiz_limiti(self, client) -> None:
        codes = [client.post("/api/pair/confirm", json={"code": "111-111", "device_name": "X"})
                 for _ in range(12)]
        assert any(r.status_code == 429 for r in codes)

    def test_bos_cihaz_adi_reddedilir(self, client) -> None:
        code = client.post("/api/pair").json()["code"]
        assert client.post(
            "/api/pair/confirm", json={"code": code, "device_name": ""}
        ).status_code == 422


class TestPairingQrUrl:
    """PRD §12 — QR url'i receiver'in GERCEK adresinden turetilir (istekten degil)."""

    def test_qr_url_en_iyi_adresten_uretilir(self, state) -> None:
        import json

        import anyio

        from phoneshare_receiver.core import addresses
        from phoneshare_receiver.services import pairing

        adaylar = addresses.detect_addresses(
            port=8765, scheme="http", interfaces=["192.168.1.180"]
        )

        async def start() -> tuple[str, str]:
            await state.db.create_all()
            async with state.db.session() as session:
                ticket = await pairing.start_pairing(session, addresses=adaylar)
                return ticket.code, json.loads(ticket.qr_payload)["url"]

        code, url = anyio.run(start)
        assert url == f"http://192.168.1.180:8765/?pair={code}"

    def test_qr_url_host_basligini_kullanmaz(self, client, state) -> None:
        """Yasanan hata: `Host: evil:8899` gonderildiginde 8899 uretiliyordu."""
        import json

        response = client.post("/api/pair", headers={"host": "evil:8899"})
        assert response.status_code == 200, response.text
        body = response.json()
        url = json.loads(body["qr_payload"])["url"]
        assert "8899" not in url
        assert "evil" not in url
        assert f":{state.config.port}/" in url
        assert body["addresses"], "adres adaylari bos olmamali"
        assert all(item["url"].startswith(("http://", "https://")) for item in body["addresses"])
        # Loopback daima listede ve telefondan erisilemez olarak isaretli.
        loopback = [item for item in body["addresses"] if item["kind"] == "loopback"]
        assert loopback and loopback[0]["reachable_from_phone"] is False

    def test_health_adresleri_dondurur(self, client, state) -> None:
        body = client.get("/api/health").json()
        assert isinstance(body["addresses"], list)
        assert any(item["kind"] == "loopback" for item in body["addresses"])
        assert all(f":{state.config.port}" in item["url"] for item in body["addresses"])


class TestTokenStorage:
    def test_token_plaintext_saklanmaz(self, client, state, paired) -> None:
        import anyio

        async def check() -> None:
            async with state.db.session() as session:
                devices = (await session.execute(select(Device))).scalars().all()
                assert len(devices) == 1
                assert devices[0].token_hash == hash_token(paired["token"])
                assert paired["token"] not in devices[0].token_hash

        anyio.run(check)


class TestAuthentication:
    def test_token_olmadan_401(self, lan_client) -> None:
        assert lan_client.get("/api/targets").status_code == 401

    def test_gecersiz_token_401(self, client, paired) -> None:
        client.headers.update({"authorization": "Bearer sahte-token"})
        assert client.get("/api/targets").status_code == 401

    def test_bozuk_authorization_401(self, client, paired) -> None:
        client.headers.update({"authorization": paired["token"]})
        assert client.get("/api/targets").status_code == 401

    def test_iptal_edilmis_cihaz_401(self, client, paired) -> None:
        assert client.get("/api/targets").status_code == 200
        assert client.delete(f"/api/devices/{paired['device_id']}").status_code == 204
        assert client.get("/api/targets").status_code == 401

    def test_health_kimlik_gerektirmez(self, client) -> None:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["status"] == "online"


class TestAuditLog:
    def test_olaylar_kaydedilir_ve_token_sizmaz(self, client, state, paired) -> None:
        import anyio

        client.headers.update({"authorization": "Bearer sahte"})
        client.get("/api/targets")

        async def check() -> None:
            async with state.db.session() as session:
                rows = (await session.execute(select(AuditLog))).scalars().all()
                events = {row.event for row in rows}
                assert "DEVICE_PAIRED" in events
                assert "AUTH_FAILED" in events
                blob = " ".join(row.detail or "" for row in rows)
                assert paired["token"] not in blob
                assert "sahte" not in blob

        anyio.run(check)
