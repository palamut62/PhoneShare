"""F2/F3 — yukleme baslangicinda dondurulan yerlestirme karari.

F2: hedef degisince ayni dosya yeni bir yukleme oturumu alir.
F3: kuraldaki yeniden adlandirma ve cakisma politikasi son kayda uygulanir ve
    yukleme surerken degisen genel ayarlar karari degistirmez.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .conftest import sha256_bytes


def _dated(root: Path, folder: str) -> Path:
    return root / folder / datetime.now().date().isoformat()


def _init(client, data: bytes, filename: str, target_id: str | None) -> dict:
    response = client.post(
        "/api/uploads/init",
        json={
            "filename": filename,
            "size": len(data),
            "mime_type": "application/octet-stream",
            "target_id": target_id,
            "sha256": sha256_bytes(data),
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _send(client, upload_id: str, data: bytes) -> None:
    response = client.post(
        f"/api/uploads/{upload_id}/chunk?chunk_index=0&chunk_hash={sha256_bytes(data)}",
        content=data,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert response.status_code == 200, response.text


class TestResumeIdentity:
    def test_hedef_degisince_yeni_oturum_acilir(
        self, client, paired, belgeler, target_root: Path
    ) -> None:
        data = b"AYNI-DOSYA" * 64
        fotograflar = client.post(
            "/api/targets",
            json={"name": "Fotograflar", "path": str(target_root / "Fotograflar")},
        ).json()["id"]

        first = _init(client, data, "ayni.bin", belgeler)
        second = _init(client, data, "ayni.bin", fotograflar)
        assert first["upload_id"] != second["upload_id"]

        # Ayni hedefe tekrar istek gelirse gercek bir resume olur.
        again = _init(client, data, "ayni.bin", belgeler)
        assert again["upload_id"] == first["upload_id"]

    def test_ayni_hedefte_gonderilen_parcalar_korunur(
        self, client, paired, belgeler
    ) -> None:
        data = b"R" * 2048
        first = _init(client, data, "resume.bin", belgeler)
        _send(client, first["upload_id"], data)
        again = _init(client, data, "resume.bin", belgeler)
        assert again["upload_id"] == first["upload_id"]
        assert again["existing_chunks"] == [0]


class TestRuleSnapshot:
    def _rule(self, client, target_id: str, **overrides) -> None:
        payload = {
            "name": "Faturalar",
            "match_type": "extension",
            "match_value": "pdf",
            "target_id": target_id,
            "rename": "fatura-{name}",
            "conflict_policy": "rename",
        }
        payload.update(overrides)
        response = client.post("/api/rules", json=payload)
        assert response.status_code in (200, 201), response.text

    def test_kural_yeniden_adlandirmasi_diske_uygulanir(
        self, client, paired, belgeler, target_root: Path
    ) -> None:
        self._rule(client, belgeler)
        data = b"PDF-ICERIK" * 32
        init = _init(client, data, "rapor.pdf", None)  # hedef otomatik: kural karar verir
        _send(client, init["upload_id"], data)
        body = client.post(f"/api/uploads/{init['upload_id']}/complete").json()

        assert body["status"] == "COMPLETED"
        assert body["stored_filename"].startswith("fatura-")
        assert (_dated(target_root, "Belgeler") / body["stored_filename"]).exists()

    def test_yukleme_sirasinda_degisen_ayar_karari_degistirmez(
        self, client, paired, belgeler, target_root: Path
    ) -> None:
        self._rule(client, belgeler)
        data = b"SNAPSHOT" * 32
        init = _init(client, data, "sozlesme.pdf", None)
        _send(client, init["upload_id"], data)

        # Yukleme baslamisken kural degistirilir; devam eden yukleme etkilenmemeli.
        rules = client.get("/api/rules").json()
        client.delete(f"/api/rules/{rules[0]['id']}")

        body = client.post(f"/api/uploads/{init['upload_id']}/complete").json()
        assert body["stored_filename"].startswith("fatura-")

    def test_hash_gonderilmezse_dogrulandi_denmez(
        self, client, paired, belgeler
    ) -> None:
        data = b"HASHSIZ" * 32
        response = client.post(
            "/api/uploads/init",
            json={
                "filename": "hashsiz.bin",
                "size": len(data),
                "mime_type": "application/octet-stream",
                "target_id": belgeler,
                "sha256": None,
            },
        )
        init = response.json()
        _send(client, init["upload_id"], data)
        body = client.post(f"/api/uploads/{init['upload_id']}/complete").json()
        assert body["status"] == "COMPLETED"
        assert body["verified"] is False
