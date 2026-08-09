"""PRD §42/§43 — /api/stats endpoint testleri."""

from __future__ import annotations

from .conftest import upload_file


class TestStats:
    def test_authsiz_401(self, lan_client) -> None:
        assert lan_client.get("/api/stats").status_code == 401

    def test_sayim_dagilim_ve_gunluk_seri(self, client, paired, belgeler, target_root) -> None:
        # Ikinci hedef: Fotograflar (belgeler fixture'inin yanina).
        fotolar = client.post(
            "/api/targets",
            json={"name": "Fotograflar", "path": str(target_root / "Fotograflar")},
        )
        assert fotolar.status_code == 201, fotolar.text
        fotolar_id = fotolar.json()["id"]

        # Farkli boyutlar: belgeler 10 bayt, fotograflar 20 bayt.
        for data, name, target_id in (
            (b"x" * 10, "a.txt", belgeler),
            (b"y" * 20, "b.jpg", fotolar_id),
        ):
            init, _ = upload_file(client, data, filename=name, target_id=target_id)
            assert client.post(f"/api/uploads/{init['upload_id']}/complete").status_code == 200

        stats = client.get("/api/stats").json()
        assert stats["total"]["files"] == 2
        assert stats["total"]["bytes"] == 30
        assert stats["today"]["files"] == 2
        assert stats["week"]["files"] == 2
        assert stats["month"]["files"] == 2

        # PRD §43 — surekli gunluk seri, bugunun kaydi dolu.
        assert len(stats["daily"]) == 14
        assert any(p["files"] == 2 and p["bytes"] == 30 for p in stats["daily"])

        # PRD §42 — bytes DESC siralama: Fotograflar (20) once gelir.
        assert stats["top_targets"][0]["target_id"] == fotolar_id
        assert stats["top_targets"][0]["name"] == "Fotograflar"
        assert stats["top_targets"][1]["target_id"] == belgeler
        assert stats["top_targets"][1]["name"] == "Belgeler"
        assert stats["top_targets"][0]["bytes"] == 20

        # by_device — tek cihaz, ad targets tablosundan cozulur.
        assert stats["by_device"][0]["device_id"] == paired["device_id"]
        assert stats["by_device"][0]["name"] == "iPhone Test"

        # file_types — init hep application/octet-stream gonderir.
        assert stats["file_types"][0]["mime_type"] == "application/octet-stream"
        assert stats["file_types"][0]["files"] == 2

    def test_complete_edilmemis_transfer_sayilmaz(self, client, paired, belgeler) -> None:
        # PRD §42 — PREPARING durumundaki transfer istatistige girmez.
        upload_file(client, b"z" * 5, filename="yarim.txt", target_id=belgeler)

        stats = client.get("/api/stats").json()
        assert stats["total"]["files"] == 0
        assert stats["total"]["bytes"] == 0
        assert stats["total"]["avg_speed"] is None
        assert stats["top_targets"] == []
        assert all(p["files"] == 0 for p in stats["daily"])

    def test_silinmis_hedefte_ad_fallback(self, client, paired, belgeler, target_root) -> None:
        fotolar = client.post(
            "/api/targets",
            json={"name": "Fotograflar", "path": str(target_root / "Fotograflar")},
        )
        assert fotolar.status_code == 201, fotolar.text
        fotolar_id = fotolar.json()["id"]

        init, _ = upload_file(client, b"q" * 7, filename="f.png", target_id=fotolar_id)
        assert client.post(f"/api/uploads/{init['upload_id']}/complete").status_code == 200
        assert client.delete(f"/api/targets/{fotolar_id}").status_code == 204

        stats = client.get("/api/stats").json()
        entry = next(t for t in stats["top_targets"] if t["target_id"] == fotolar_id)
        # PRD §42 — target silinmis; LEFT JOIN fallback: name == target_id.
        assert entry["name"] == fotolar_id
