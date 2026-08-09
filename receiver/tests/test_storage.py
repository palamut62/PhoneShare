"""PRD §30/§31/§32/§53 — gecici depo, cakisma politikalari, atomik tasima, adlandirma."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import pytest

from phoneshare_receiver.services.naming import apply_naming_template
from phoneshare_receiver.storage.files import (
    DiskQuotaError,
    atomic_move,
    ensure_capacity,
    plan_placement,
)
from phoneshare_receiver.storage.temp import TempStore


class TestConflictPolicy:
    def test_dosya_yoksa_ayni_ad(self, tmp_path: Path) -> None:
        result = plan_placement(tmp_path, "rapor.pdf", "rename")
        assert result.file_name == "rapor.pdf"
        assert not result.skipped and not result.overwritten

    def test_rename_varsayilan_seri(self, tmp_path: Path) -> None:
        """PRD §31: rapor.pdf -> rapor (1).pdf -> rapor (2).pdf"""
        (tmp_path / "rapor.pdf").write_text("x")
        first = plan_placement(tmp_path, "rapor.pdf", "rename")
        assert first.file_name == "rapor (1).pdf"
        first.path.write_text("x")  # type: ignore[union-attr]
        second = plan_placement(tmp_path, "rapor.pdf", "rename")
        assert second.file_name == "rapor (2).pdf"

    def test_overwrite(self, tmp_path: Path) -> None:
        (tmp_path / "rapor.pdf").write_text("x")
        result = plan_placement(tmp_path, "rapor.pdf", "overwrite")
        assert result.file_name == "rapor.pdf"
        assert result.overwritten

    def test_skip(self, tmp_path: Path) -> None:
        (tmp_path / "rapor.pdf").write_text("x")
        result = plan_placement(tmp_path, "rapor.pdf", "skip")
        assert result.skipped
        assert result.path is None

    def test_version(self, tmp_path: Path) -> None:
        (tmp_path / "rapor.pdf").write_text("x")
        assert plan_placement(tmp_path, "rapor.pdf", "version").file_name == "rapor_v2.pdf"

    def test_cok_uzantili_ad(self, tmp_path: Path) -> None:
        (tmp_path / "yedek.tar.gz").write_text("x")
        assert plan_placement(tmp_path, "yedek.tar.gz", "rename").file_name == "yedek.tar (1).gz"

    def test_gecersiz_ad_temizlenir(self, tmp_path: Path) -> None:
        assert plan_placement(tmp_path, "../../evil.exe", "rename").file_name == "evil.exe"


class TestCapacity:
    def test_yeterli_alan_gecer(self, tmp_path: Path) -> None:
        ensure_capacity(tmp_path, 1024)

    def test_asiri_boyut_reddedilir(self, tmp_path: Path) -> None:
        with pytest.raises(DiskQuotaError):
            ensure_capacity(tmp_path, 1 << 60)

    def test_kota_asimi(self, tmp_path: Path) -> None:
        (tmp_path / "var.bin").write_bytes(b"x" * 4096)
        with pytest.raises(DiskQuotaError):
            ensure_capacity(tmp_path, 4096, quota_bytes=5000)


class TestAtomicMove:
    def test_tasima(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        src = tmp_path / "kaynak.part"
        src.write_bytes(b"veri")
        moved = atomic_move(src, root / "hedef.bin", [root])
        assert moved.read_bytes() == b"veri"
        assert not src.exists()

    def test_allow_list_disina_tasinmaz(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        src = tmp_path / "kaynak.part"
        src.write_bytes(b"veri")
        with pytest.raises(PermissionError):
            atomic_move(src, tmp_path / "disari.bin", [root])


class TestTempStore:
    def test_chunk_yaz_ve_birlestir(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        payload = [b"a" * 10, b"b" * 10, b"c" * 5]
        for index, block in enumerate(payload):
            store.write_chunk("u1", index, block)
        assert store.existing_chunks("u1", 3) == [0, 1, 2]
        path, digest, size = store.assemble("u1", 3)
        joined = b"".join(payload)
        assert size == len(joined)
        assert digest == hashlib.sha256(joined).hexdigest()
        assert path.read_bytes() == joined

    def test_idempotent_yazma(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        store.write_chunk("u1", 0, b"aaa")
        store.write_chunk("u1", 0, b"aaa")
        assert store.existing_chunks("u1", 1) == [0]

    def test_eksik_parca_hata(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        store.write_chunk("u1", 0, b"a")
        with pytest.raises(FileNotFoundError):
            store.assemble("u1", 2)

    def test_cleanup(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        store.write_chunk("u1", 0, b"a")
        store.cleanup("u1")
        assert not store.upload_dir("u1").exists()

    def test_upload_id_traversal_engellenir(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        # Ayirici ve nokta karakterleri atilir; sonuc her zaman kok altinda kalir.
        assert store.upload_dir("../../../etc").parent == store.root
        with pytest.raises(ValueError):
            store.upload_dir("...")

    def test_negatif_chunk_indeksi(self, tmp_path: Path) -> None:
        store = TempStore(tmp_path / ".temp")
        with pytest.raises(ValueError):
            store.chunk_path("u1", -1)


class TestNaming:
    NOW = datetime(2026, 8, 7, 14, 5, 9, tzinfo=UTC)

    def test_bos_sablon_orijinali_korur(self) -> None:
        assert apply_naming_template("", "IMG_3847.jpg") == "IMG_3847.jpg"

    def test_prd_ornegi(self) -> None:
        """PRD §32: {date}_{original} -> 2026-08-07_IMG_3847.jpg"""
        out = apply_naming_template("{date}_{original}", "IMG_3847.jpg", now=self.NOW)
        assert out == "2026-08-07_IMG_3847.jpg"

    def test_tum_degiskenler(self) -> None:
        out = apply_naming_template(
            "{date}_{time}_{device}_{folder}_{original}_{counter}.{extension}",
            "rapor.pdf",
            device_name="iPhone",
            folder_name="Akpazar",
            counter=4,
            now=self.NOW,
        )
        assert out == "2026-08-07_14-05-09_iPhone_Akpazar_rapor_004.pdf"

    def test_extension_yoksa_korunur(self) -> None:
        assert apply_naming_template("{original}-yedek", "rapor.pdf") == "rapor-yedek.pdf"

    def test_sonuc_temizlenir(self) -> None:
        out = apply_naming_template("{original}", "../../CON.txt")
        assert "/" not in out and "\\" not in out
        assert out.split(".")[0].lower() != "con"
