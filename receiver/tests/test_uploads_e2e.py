"""PRD §27-§32, §52, §53, §58-§60 — chunk upload, resume, dogrulama, cakisma, limitler."""

from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path

from .conftest import CHUNK, sha256_bytes, upload_file


def payload(size: int, seed: bytes = b"P") -> bytes:
    return (seed * ((size // len(seed)) + 1))[:size]


def dated_folder(root: Path, target: str | None = None) -> Path:
    base = root / target if target else root
    return base / datetime.now().date().isoformat()


class TestUploadHappyPath:
    def test_uctan_uca(self, client, belgeler, target_root: Path) -> None:
        """init -> chunk'lar -> complete -> hedef klasorde dogru ad + dogru SHA-256."""
        data = payload(CHUNK * 2 + 1234)
        init, _ = upload_file(client, data, filename="rapor.pdf", target_id=belgeler)
        assert init["chunk_size"] == CHUNK
        assert init["total_chunks"] == 3
        assert init["existing_chunks"] == []

        response = client.post(f"/api/uploads/{init['upload_id']}/complete")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["status"] == "COMPLETED"
        assert body["verified"] is True
        assert body["stored_filename"] == "rapor.pdf"
        assert body["sha256"] == sha256_bytes(data)

        stored = dated_folder(target_root, "Belgeler") / "rapor.pdf"
        assert stored.exists()
        assert hashlib.sha256(stored.read_bytes()).hexdigest() == sha256_bytes(data)
        # Gecici dosyalar temizlenmis olmalidir (PRD §30).
        assert not any((target_root / ".temp").glob("*/*.part"))

    def test_transfer_gecmisine_yazilir(self, client, belgeler) -> None:
        data = payload(1000)
        init, _ = upload_file(client, data, filename="not.txt", target_id=belgeler)
        client.post(f"/api/uploads/{init['upload_id']}/complete")

        listing = client.get("/api/transfers").json()
        assert listing["total"] == 1
        item = listing["items"][0]
        assert item["original_filename"] == "not.txt"
        assert item["status"] == "COMPLETED"
        assert item["verified"] is True
        assert item["average_speed"] is not None

        single = client.get(f"/api/transfers/{item['id']}")
        assert single.status_code == 200
        assert single.json()["id"] == item["id"]

    def test_hedef_belirtilmezse_varsayilana_gider(
        self, client, paired, target_root: Path
    ) -> None:
        data = payload(500)
        init, _ = upload_file(client, data, filename="serbest.bin")
        assert client.post(f"/api/uploads/{init['upload_id']}/complete").json()["status"] == (
            "COMPLETED"
        )
        assert (dated_folder(target_root) / "serbest.bin").exists()

    def test_dosya_adi_temizlenir(self, client, belgeler, target_root: Path) -> None:
        """PRD §51 — traversal ve gecersiz karakterler hedefe sizamaz."""
        data = payload(64)
        init, _ = upload_file(
            client, data, filename=r"..\..\Windows\CON.txt", target_id=belgeler
        )
        client.post(f"/api/uploads/{init['upload_id']}/complete")
        files = list(dated_folder(target_root, "Belgeler").iterdir())
        assert len(files) == 1
        assert files[0].name == "_CON.txt"


class TestResume:
    def test_eksik_chunk_devam_ettirilir(self, client, belgeler, target_root: Path) -> None:
        """PRD §28 — bir parca atlanir, init ayni upload'i ve existing_chunks'i doner."""
        data = payload(CHUNK * 3)
        first, _ = upload_file(
            client, data, filename="buyuk.bin", target_id=belgeler, skip_indexes=(1,)
        )

        again = client.post(
            "/api/uploads/init",
            json={
                "filename": "buyuk.bin",
                "size": len(data),
                "mime_type": "application/octet-stream",
                "target_id": belgeler,
                "sha256": sha256_bytes(data),
            },
        )
        assert again.status_code == 200
        resumed = again.json()
        assert resumed["upload_id"] == first["upload_id"]
        assert resumed["existing_chunks"] == [0, 2, 3] or resumed["existing_chunks"] == [0, 2]

        # Eksik parca tamamlanmadan complete basarisiz olmalidir.
        incomplete = client.post(f"/api/uploads/{first['upload_id']}/complete")
        assert incomplete.status_code == 409

        block = data[CHUNK : CHUNK * 2]
        assert client.post(
            f"/api/uploads/{first['upload_id']}/chunk",
            params={"chunk_index": 1, "chunk_hash": sha256_bytes(block)},
            content=block,
            headers={"content-type": "application/octet-stream"},
        ).status_code == 200

        done = client.post(f"/api/uploads/{first['upload_id']}/complete")
        assert done.status_code == 200
        assert done.json()["verified"] is True
        stored = dated_folder(target_root, "Belgeler") / "buyuk.bin"
        assert hashlib.sha256(stored.read_bytes()).hexdigest() == sha256_bytes(data)

    def test_ayni_chunk_tekrar_gonderilebilir(self, client, belgeler) -> None:
        data = payload(CHUNK + 10)
        init, _ = upload_file(client, data, filename="tekrar.bin", target_id=belgeler)
        block = data[:CHUNK]
        for _ in range(3):
            response = client.post(
                f"/api/uploads/{init['upload_id']}/chunk",
                params={"chunk_index": 0, "chunk_hash": sha256_bytes(block)},
                content=block,
                headers={"content-type": "application/octet-stream"},
            )
            assert response.status_code == 200
            assert response.json()["received_bytes"] == len(data)
        assert client.post(f"/api/uploads/{init['upload_id']}/complete").json()["verified"]


class TestChunkValidation:
    def _init(self, client, belgeler, data: bytes) -> dict:
        return client.post(
            "/api/uploads/init",
            json={
                "filename": "x.bin",
                "size": len(data),
                "target_id": belgeler,
                "sha256": sha256_bytes(data),
            },
        ).json()

    def test_sira_disi_indeks_reddedilir(self, client, belgeler) -> None:
        data = payload(100)
        init = self._init(client, belgeler, data)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 99},
            content=data,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 422

    def test_bozuk_chunk_hash_reddedilir(self, client, belgeler) -> None:
        data = payload(100)
        init = self._init(client, belgeler, data)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0, "chunk_hash": "f" * 64},
            content=data,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 422

    def test_malformed_chunk_hash_reddedilir(self, client, belgeler) -> None:
        data = payload(100)
        init = self._init(client, belgeler, data)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0, "chunk_hash": "zzz"},
            content=data,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 422

    def test_yanlis_boyutlu_chunk_reddedilir(self, client, belgeler) -> None:
        data = payload(100)
        init = self._init(client, belgeler, data)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0},
            content=data[:50],
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 422

    def test_asiri_buyuk_govde_reddedilir(self, client, belgeler) -> None:
        data = payload(CHUNK * 2)
        init = self._init(client, belgeler, data)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0},
            content=payload(CHUNK * 8),
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 413

    def test_baska_cihazin_upload_id_si_gorulemez(self, client, belgeler) -> None:
        data = payload(100)
        init = self._init(client, belgeler, data)
        code = client.post("/api/pair").json()["code"]
        other = client.post(
            "/api/pair/confirm", json={"code": code, "device_name": "Baska"}
        ).json()
        client.headers.update({"authorization": f"Bearer {other['token']}"})
        assert client.post(f"/api/uploads/{init['upload_id']}/complete").status_code == 404


class TestHashVerification:
    def test_bozuk_dosya_failed_olur(self, client, belgeler, target_root: Path) -> None:
        """PRD §29 — beyan edilen SHA-256 tutmazsa transfer FAILED olur ve dosya yazilmaz."""
        data = payload(200)
        init = client.post(
            "/api/uploads/init",
            json={
                "filename": "bozuk.bin",
                "size": len(data),
                "target_id": belgeler,
                "sha256": "b" * 64,
            },
        ).json()
        assert client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0},
            content=data,
            headers={"content-type": "application/octet-stream"},
        ).status_code == 200

        response = client.post(f"/api/uploads/{init['upload_id']}/complete")
        assert response.status_code == 422
        assert response.json()["code"] == "checksum_mismatch"
        assert not (dated_folder(target_root, "Belgeler") / "bozuk.bin").exists()

        transfers = client.get("/api/transfers").json()["items"]
        assert transfers[0]["status"] == "FAILED"
        # Gecici dosyalar temizlenmis olmalidir.
        assert not list((target_root / ".temp").glob("*/*.part"))


class TestConflicts:
    def test_yeni_isim_olustur_varsayilan(self, client, belgeler, target_root: Path) -> None:
        """PRD §31 — rapor.pdf -> rapor (1).pdf -> rapor (2).pdf"""
        names = []
        for index in range(3):
            data = payload(120 + index)
            init, _ = upload_file(client, data, filename="rapor.pdf", target_id=belgeler)
            names.append(
                client.post(f"/api/uploads/{init['upload_id']}/complete").json()[
                    "stored_filename"
                ]
            )
        assert names == ["rapor.pdf", "rapor (1).pdf", "rapor (2).pdf"]
        assert (dated_folder(target_root, "Belgeler") / "rapor (2).pdf").exists()

    def test_uzerine_yaz(self, client, belgeler, target_root: Path) -> None:
        client.put("/api/settings", json={"conflict_policy": "overwrite"})
        for seed in (b"A", b"B"):
            data = payload(64, seed)
            init, _ = upload_file(client, data, filename="tek.bin", target_id=belgeler)
            client.post(f"/api/uploads/{init['upload_id']}/complete")
        assert list(dated_folder(target_root, "Belgeler").iterdir()).__len__() == 1
        assert (dated_folder(target_root, "Belgeler") / "tek.bin").read_bytes()[:1] == b"B"

    def test_atla(self, client, belgeler, target_root: Path) -> None:
        data = payload(64, b"A")
        init, _ = upload_file(client, data, filename="tek.bin", target_id=belgeler)
        client.post(f"/api/uploads/{init['upload_id']}/complete")

        client.put("/api/settings", json={"conflict_policy": "skip"})
        data2 = payload(64, b"B")
        init2, _ = upload_file(client, data2, filename="tek.bin", target_id=belgeler)
        response = client.post(f"/api/uploads/{init2['upload_id']}/complete")
        assert response.json()["status"] == "CANCELLED"
        assert (dated_folder(target_root, "Belgeler") / "tek.bin").read_bytes()[:1] == b"A"


class TestLimits:
    def test_tek_dosya_limiti(self, client, belgeler) -> None:
        """PRD §52 — tek dosya siniri asilirsa 413 ve kullanici dostu mesaj."""
        response = client.post(
            "/api/uploads/init",
            json={"filename": "dev.bin", "size": 9 * 1024 * 1024, "target_id": belgeler},
        )
        assert response.status_code == 413
        body = response.json()
        assert body["code"] == "too_large"
        assert "limit" not in body["message"]

    def test_toplam_transfer_limiti(self, client, belgeler) -> None:
        for index in range(6):
            response = client.post(
                "/api/uploads/init",
                json={
                    "filename": f"parca{index}.bin",
                    "size": 8 * 1024 * 1024,
                    "target_id": belgeler,
                },
            )
            if response.status_code == 413:
                assert response.json()["code"] == "too_large"
                return
        raise AssertionError("Toplam transfer limiti uygulanmadi.")

    def test_disk_yetersiz(self, client, belgeler, monkeypatch) -> None:
        """PRD §53/§71 — 507 ve teknik detay ICERMEYEN mesaj."""
        import shutil

        real = shutil.disk_usage

        def fake(path):  # noqa: ANN001, ANN202
            usage = real(path)
            return type(usage)(usage.total, usage.total, 1)

        monkeypatch.setattr(shutil, "disk_usage", fake)
        response = client.post(
            "/api/uploads/init",
            json={"filename": "buyuk.bin", "size": 4 * 1024 * 1024, "target_id": belgeler},
        )
        assert response.status_code == 507
        assert response.json() == {
            "code": "insufficient_storage",
            "message": "Bilgisayarda yeterli disk alani bulunmuyor.",
        }

    def test_sifir_boyut_reddedilir(self, client, belgeler) -> None:
        response = client.post(
            "/api/uploads/init",
            json={"filename": "bos.bin", "size": 0, "target_id": belgeler},
        )
        assert response.status_code == 422


class TestCancel:
    def test_iptal_temizler(self, client, belgeler, target_root: Path) -> None:
        data = payload(CHUNK + 5)
        init, _ = upload_file(client, data, filename="iptal.bin", target_id=belgeler)
        assert client.delete(f"/api/uploads/{init['upload_id']}").status_code == 204
        assert not (target_root / ".temp" / init["upload_id"]).exists()
        assert client.get("/api/transfers").json()["items"][0]["status"] == "CANCELLED"

    def test_iptal_sonrasi_chunk_reddedilir(self, client, belgeler) -> None:
        data = payload(100)
        init, _ = upload_file(client, data, filename="iptal2.bin", target_id=belgeler)
        client.delete(f"/api/uploads/{init['upload_id']}")
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            params={"chunk_index": 0},
            content=data,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 409
