"""Inceleme bulgulari icin regresyon testleri: sablon, hata yolu, terk edilmis
yuklemeler, cakisma yarisi, yerel oturum omru ve guvenlik basliklari."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from phoneshare_receiver.models import Upload
from phoneshare_receiver.storage.files import atomic_move

from .conftest import upload_file
from .test_uploads_e2e import dated_folder, payload


def test_genel_adlandirma_sablonu_uygulanir(client, belgeler, target_root: Path) -> None:
    client.put("/api/settings", json={"naming_template": "{original}-yedek"})
    init, _ = upload_file(client, payload(100), filename="rapor.pdf", target_id=belgeler)
    body = client.post(f"/api/uploads/{init['upload_id']}/complete").json()
    assert body["stored_filename"] == "rapor-yedek.pdf"
    assert (dated_folder(target_root, "Belgeler") / "rapor-yedek.pdf").exists()


def test_birlestirme_hatasi_200_donmez(client, belgeler, state, monkeypatch) -> None:
    init, _ = upload_file(client, payload(100), filename="a.bin", target_id=belgeler)

    def boom(*_args):
        raise OSError("disk hatasi")

    monkeypatch.setattr(state.temp_store, "assemble", boom)
    response = client.post(f"/api/uploads/{init['upload_id']}/complete")
    assert response.status_code == 409
    item = client.get("/api/transfers").json()["items"][0]
    assert item["status"] == "FAILED"


def test_terk_edilmis_yukleme_temizlenir(client, belgeler, state) -> None:
    init, _ = upload_file(
        client, payload(4000), filename="yarim.bin", target_id=belgeler, skip_indexes=(0,)
    )
    upload_dir = state.temp_store.upload_dir(init["upload_id"])
    orphan = state.temp_store.ensure("yetimklasor")
    assert upload_dir.exists() and orphan.exists()

    async def age_and_sweep() -> int:
        async with state.db.session() as session:
            row = await session.get(Upload, init["upload_id"])
            row.updated_at = datetime.now(tz=UTC) - timedelta(days=2)
            await session.commit()
        return await state.sweep_uploads()

    assert client.portal.call(age_and_sweep) == 1
    assert not upload_dir.exists()
    assert not orphan.exists()
    item = client.get("/api/transfers").json()["items"][0]
    assert item["status"] == "CANCELLED"


def test_atomic_move_uzerine_yazmaz(tmp_path: Path) -> None:
    src = tmp_path / "src.bin"
    dst = tmp_path / "hedef.bin"
    src.write_bytes(b"yeni")
    dst.write_bytes(b"eski")
    with pytest.raises(FileExistsError):
        atomic_move(src, dst, [tmp_path])
    assert dst.read_bytes() == b"eski"
    atomic_move(src, dst, [tmp_path], overwrite=True)
    assert dst.read_bytes() == b"yeni"


def test_yerel_oturum_suresi_dolar(state) -> None:
    token = state.issue_local_session()
    assert state.local_session_valid(token)
    state._local_sessions[token] = datetime.now(tz=UTC) - timedelta(seconds=1)
    assert not state.local_session_valid(token)
    assert not state.local_session_valid(None)


def test_guvenlik_basliklari(client) -> None:
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_eszamanli_complete_tek_dosya_uretir(client, belgeler, target_root: Path) -> None:
    init, _ = upload_file(client, payload(3000), filename="tek.bin", target_id=belgeler)
    url = f"/api/uploads/{init['upload_id']}/complete"

    async def both():
        import httpx

        transport = httpx.ASGITransport(app=client.app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://testserver", cookies=client.cookies
        ) as ac:
            return await asyncio.gather(ac.post(url), ac.post(url))

    results = client.portal.call(both)
    assert all(r.status_code == 200 for r in results), [r.text for r in results]
    files = list(dated_folder(target_root, "Belgeler").iterdir())
    assert [f.name for f in files] == ["tek.bin"]
