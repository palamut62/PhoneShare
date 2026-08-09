"""PRD §50/§51/§83 — dosya adi temizleme ve path traversal korumasi."""

from __future__ import annotations

from pathlib import Path

import pytest

from phoneshare_receiver.security.paths import (
    RESERVED_WINDOWS_NAMES,
    UnsafePathError,
    is_safe_file_name,
    is_within,
    resolve_within_roots,
    safe_join,
    sanitize_file_name,
    validate_folder_path,
)


class TestFilenameSanitization:
    @pytest.mark.parametrize("char", list('<>:"/\\|?*'))
    def test_gecersiz_windows_karakterleri_temizlenir(self, char: str) -> None:
        cleaned = sanitize_file_name(f"rapor{char}2026.pdf")
        assert char not in cleaned
        assert is_safe_file_name(cleaned)

    @pytest.mark.parametrize("name", sorted(RESERVED_WINDOWS_NAMES))
    def test_reserved_isimler_ele_alinir(self, name: str) -> None:
        cleaned = sanitize_file_name(f"{name}.txt")
        assert cleaned.split(".")[0].lower() not in RESERVED_WINDOWS_NAMES
        assert is_safe_file_name(cleaned)

    def test_reserved_isim_uzantisiz(self) -> None:
        assert is_safe_file_name(sanitize_file_name("CON"))
        assert not is_safe_file_name("CON")

    def test_sondaki_nokta_ve_bosluk_atilir(self) -> None:
        assert sanitize_file_name("rapor.pdf. ") == "rapor.pdf"
        assert sanitize_file_name("rapor   ") == "rapor"

    def test_dizin_ayiricilari_asla_kalmaz(self) -> None:
        for raw in ("../../etc/passwd", r"..\..\Windows\System32\test.exe", "a/b/c.txt"):
            cleaned = sanitize_file_name(raw)
            assert "/" not in cleaned and "\\" not in cleaned
            assert cleaned not in (".", "..")

    def test_bos_ada_dusmez(self) -> None:
        assert sanitize_file_name("") == "dosya"
        assert sanitize_file_name("...") == "dosya"
        assert sanitize_file_name("///") == "dosya"

    def test_kontrol_karakterleri_silinir(self) -> None:
        assert sanitize_file_name("ra\x00por\x1f.pdf") == "rapor.pdf"

    def test_255_karakter_siniri(self) -> None:
        assert len(sanitize_file_name("a" * 400 + ".pdf")) <= 255


class TestPathValidation:
    def test_mutlak_yol_gerekir(self) -> None:
        with pytest.raises(UnsafePathError):
            validate_folder_path("Belgeler\\Rapor")

    def test_traversal_reddedilir(self) -> None:
        with pytest.raises(UnsafePathError):
            validate_folder_path(r"D:\Depo\..\..\Windows\System32")

    def test_unc_reddedilir(self) -> None:
        with pytest.raises(UnsafePathError):
            validate_folder_path(r"\\sunucu\paylasim")

    def test_uzatilmis_cihaz_yolu_reddedilir(self) -> None:
        with pytest.raises(UnsafePathError):
            validate_folder_path("\\\\?\\D:\\Depo")

    def test_reserved_segment_reddedilir(self) -> None:
        with pytest.raises(UnsafePathError):
            validate_folder_path(r"D:\Depo\CON")

    def test_normalize_edilir(self) -> None:
        assert validate_folder_path("d:/Depo/Belgeler/") == r"D:\Depo\Belgeler"


class TestAllowList:
    def test_kok_disina_yazilamaz(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        outside = tmp_path / "gizli"
        outside.mkdir()
        with pytest.raises(UnsafePathError):
            resolve_within_roots(str(outside), [root])

    def test_kok_altinda_kabul_edilir(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        (root / "alt").mkdir(parents=True)
        assert resolve_within_roots(str(root / "alt"), [root])

    def test_surucu_degisimi_reddedilir(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        with pytest.raises(UnsafePathError):
            resolve_within_roots(r"C:\Windows\System32", [root])

    def test_kok_tanimli_degilse_reddedilir(self) -> None:
        with pytest.raises(UnsafePathError):
            resolve_within_roots(r"D:\Depo", [])

    def test_safe_join_traversal_engeller(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        joined = safe_join(root, "../../evil.exe", [root])
        assert joined.parent == root
        assert joined.name == "evil.exe"

    def test_is_within(self, tmp_path: Path) -> None:
        root = tmp_path / "depo"
        root.mkdir()
        assert is_within(root / "a" / "b.txt", root)
        assert not is_within(tmp_path / "baska.txt", root)
