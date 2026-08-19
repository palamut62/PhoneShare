"""Ortak test fikstursleri: izole PHONESHARE_HOME, gercek hedef klasorler, eslesmis cihaz."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

CHUNK = 64 * 1024


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Her test kendi %LOCALAPPDATA%\\PhoneShare kopyasinda calisir."""
    home = tmp_path / "phoneshare-home"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("PHONESHARE_HOME", str(home))
    # PWA build ciktisi testlerde kullanilmaz.
    monkeypatch.delenv("PHONESHARE_WEB_DIST", raising=False)
    return home


@pytest.fixture
def target_root(tmp_path: Path) -> Path:
    root = tmp_path / "depo"
    (root / "Belgeler").mkdir(parents=True, exist_ok=True)
    (root / "Fotograflar").mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture
def config(target_root: Path):
    from phoneshare_receiver.core.config import ReceiverConfig

    return ReceiverConfig(
        device_name="TEST-PC",
        base_folder=str(target_root),
        allowed_roots=[str(target_root)],
        chunk_size=CHUNK,
        max_file_bytes=8 * 1024 * 1024,
        max_total_transfer_bytes=32 * 1024 * 1024,
        mdns_enabled=False,
        tray_enabled=False,
        remote_browse_enabled=True,
    )


@pytest.fixture
def state(config, tmp_path: Path):
    from phoneshare_receiver.core.state import ReceiverState

    return ReceiverState(config, base_dir=tmp_path / "receiver-data")


@pytest.fixture
def client(state):
    """PC'nin kendi paneli gibi davranir: loopback peer adresi."""
    from phoneshare_receiver.app import create_app

    app = create_app(state, configure_logging=False)
    with TestClient(app, client=("127.0.0.1", 51234)) as test_client:
        yield test_client


@pytest.fixture
def lan_client(client):
    """Agdaki bir telefon gibi davranir: ayni uygulama, loopback DISI peer adresi."""
    return TestClient(client.app, client=("192.168.1.50", 51234))


@pytest.fixture
def paired(client) -> dict:
    """Eslestirme akisini calistirip token + varsayilan hedefleri dondurur."""
    start = client.post("/api/pair")
    assert start.status_code == 200, start.text
    code = start.json()["code"]
    confirm = client.post(
        "/api/pair/confirm", json={"code": code, "device_name": "iPhone Test"}
    )
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    client.headers.update({"authorization": f"Bearer {body['token']}"})
    return body


@pytest.fixture
def belgeler(client, paired, target_root: Path) -> str:
    """`Belgeler` sanal hedefini olusturur ve id'sini dondurur."""
    response = client.post(
        "/api/targets",
        json={"name": "Belgeler", "path": str(target_root / "Belgeler"), "favorite": True},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def upload_file(
    client,
    data: bytes,
    *,
    filename: str,
    target_id: str | None = None,
    skip_indexes: tuple[int, ...] = (),
    with_chunk_hash: bool = True,
) -> tuple[dict, dict | None]:
    """init -> chunk'lar -> (complete cagrilmaz). (init_body, None) doner."""
    init = client.post(
        "/api/uploads/init",
        json={
            "filename": filename,
            "size": len(data),
            "mime_type": "application/octet-stream",
            "target_id": target_id,
            "sha256": sha256_bytes(data),
        },
    )
    assert init.status_code == 200, init.text
    body = init.json()
    size = body["chunk_size"]
    for index in range(body["total_chunks"]):
        if index in skip_indexes:
            continue
        block = data[index * size : (index + 1) * size]
        params = {"chunk_index": index}
        if with_chunk_hash:
            params["chunk_hash"] = sha256_bytes(block)
        response = client.post(
            f"/api/uploads/{body['upload_id']}/chunk",
            params=params,
            content=block,
            headers={"content-type": "application/octet-stream"},
        )
        assert response.status_code == 200, response.text
    return body, None
