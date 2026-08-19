"""Telefondan PC dosyalarina guvenli erisim API testleri."""

from __future__ import annotations

from pathlib import Path


def test_lists_targets_and_nested_files(client, paired, belgeler: str, target_root: Path) -> None:
    folder = target_root / "Belgeler" / "Raporlar"
    folder.mkdir()
    (folder / "rapor.pdf").write_bytes(b"PDF-data")

    roots = client.get("/api/files")
    assert roots.status_code == 200
    root_entries = roots.json()["entries"]
    assert any(
        entry == {
            "name": "Belgeler",
            "path": "",
            "kind": "target",
            "size": None,
            "modified_at": None,
            "target_id": belgeler,
        }
        for entry in root_entries
    )

    listing = client.get("/api/files", params={"target_id": belgeler, "path": "Raporlar"})
    assert listing.status_code == 200
    entry = listing.json()["entries"][0]
    assert entry["name"] == "rapor.pdf"
    assert entry["path"] == "Raporlar/rapor.pdf"
    assert entry["kind"] == "file"
    assert entry["size"] == 8


def test_downloads_file(client, paired, belgeler: str, target_root: Path) -> None:
    content = b"phone-download"
    (target_root / "Belgeler" / "belge.txt").write_bytes(content)

    response = client.get(
        "/api/files/download", params={"target_id": belgeler, "path": "belge.txt"}
    )

    assert response.status_code == 200
    assert response.content == content
    assert "belge.txt" in response.headers["content-disposition"]


def test_rejects_traversal_and_requires_phone_auth(
    client, lan_client, paired, belgeler: str
) -> None:
    traversal = client.get(
        "/api/files/download", params={"target_id": belgeler, "path": "../secret.txt"}
    )
    assert traversal.status_code == 422

    unauthenticated = lan_client.get("/api/files")
    assert unauthenticated.status_code == 401


def test_rejects_alternate_data_stream_path(client, paired, belgeler: str) -> None:
    """Windows ADS (dosya.txt:ads) ile guvenlik denetimlerinin atlatilmasini engeller."""
    listing = client.get(
        "/api/files", params={"target_id": belgeler, "path": "belge.txt:gizli"}
    )
    assert listing.status_code == 422

    download = client.get(
        "/api/files/download", params={"target_id": belgeler, "path": "belge.txt:gizli"}
    )
    assert download.status_code == 422


def test_remote_browse_disabled_by_default(client, paired, belgeler: str, state) -> None:
    """Uzaktan dosya erisimi varsayilan kapali olmali; kapaliyken istekler reddedilir."""
    state.config.remote_browse_enabled = False

    listing = client.get("/api/files", params={"target_id": belgeler})
    assert listing.status_code == 422

    download = client.get(
        "/api/files/download", params={"target_id": belgeler, "path": "belge.txt"}
    )
    assert download.status_code == 422
