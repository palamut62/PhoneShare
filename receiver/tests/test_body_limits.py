"""F5 — chunk govdesi AYRISTIRILMADAN once sinirlanir (ham ve multipart)."""

from __future__ import annotations

from .conftest import CHUNK, sha256_bytes


def _init(client, size: int, filename: str = "buyuk.bin") -> dict:
    response = client.post(
        "/api/uploads/init",
        json={
            "filename": filename,
            "size": size,
            "mime_type": "application/octet-stream",
            "target_id": None,
            "sha256": None,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _chunked(body: bytes):
    """Content-Length bildirmeyen (chunked) govde uretir."""

    def generator():
        step = 64 * 1024
        for offset in range(0, len(body), step):
            yield body[offset : offset + step]

    return generator()


class TestChunkBodyLimits:
    def test_ham_govde_content_length_ile_reddedilir(self, client, paired, belgeler) -> None:
        init = _init(client, CHUNK)
        oversized = b"X" * (CHUNK * 4)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk?chunk_index=0",
            content=oversized,
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 413

    def test_ham_govde_content_length_bildirilmese_de_reddedilir(self, client, paired, belgeler) -> None:
        init = _init(client, CHUNK)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk?chunk_index=0",
            content=_chunked(b"X" * (CHUNK * 4)),
            headers={"Content-Type": "application/octet-stream"},
        )
        assert response.status_code == 413

    def test_multipart_govde_ayristirilmadan_reddedilir(self, client, paired, belgeler) -> None:
        init = _init(client, CHUNK)
        oversized = b"X" * (CHUNK * 4)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            data={"chunk_index": "0", "chunk_hash": sha256_bytes(oversized)},
            files={"file": ("chunk.bin", oversized, "application/octet-stream")},
        )
        assert response.status_code == 413

    def test_bozuk_multipart_kontrollu_hata_verir(self, client, paired, belgeler) -> None:
        init = _init(client, CHUNK)
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            content=b"--sinir\r\nbozuk govde",
            headers={"Content-Type": "multipart/form-data; boundary=sinir"},
        )
        assert 400 <= response.status_code < 500

    def test_gecerli_multipart_parca_kabul_edilir(self, client, paired, belgeler) -> None:
        data = b"M" * 4096
        init = _init(client, len(data), filename="multipart.bin")
        response = client.post(
            f"/api/uploads/{init['upload_id']}/chunk",
            data={"chunk_index": "0", "chunk_hash": sha256_bytes(data)},
            files={"file": ("chunk.bin", data, "application/octet-stream")},
        )
        assert response.status_code == 200, response.text
        assert response.json()["received_bytes"] == len(data)
