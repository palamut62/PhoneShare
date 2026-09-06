"""F6 — bloklayan disk/hash isleri olay dongusunu bloklamaz.

Buyuk bir dosya birlestirilirken saglik ucu ve diger istekler yanit vermeye
devam etmelidir.
"""

from __future__ import annotations

import threading

import pytest

from .conftest import sha256_bytes


def _init(client, data: bytes, target_id: str) -> dict:
    response = client.post(
        "/api/uploads/init",
        json={
            "filename": "buyuk.bin",
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


def test_birlestirme_calisma_ipliginde_yapilir(
    client, paired, belgeler, monkeypatch: pytest.MonkeyPatch
) -> None:
    """assemble() olay dongusunun ipliginde degil, havuz ipliginde calisir."""
    from phoneshare_receiver.storage.temp import TempStore

    original = TempStore.assemble
    seen: list[str] = []

    def spy(self, upload_id: str, total_chunks: int):
        seen.append(threading.current_thread().name)
        return original(self, upload_id, total_chunks)

    monkeypatch.setattr(TempStore, "assemble", spy)

    data = b"B" * 8192
    init = _init(client, data, belgeler)
    _send(client, init["upload_id"], data)
    assert client.post(f"/api/uploads/{init['upload_id']}/complete").status_code == 200
    assert seen and all(name != "MainThread" for name in seen)
