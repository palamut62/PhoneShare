"""Yol guvenligi: allow-list zorlamasi, path traversal / UNC / symlink kacisi engelleme.

`packages/shared/src/path.ts` ile ayni kurallari uygular, ustune yerel dosya sistemi
gerceklerini (symlink/junction cozumlemesi) ekler. Yazma YALNIZCA allow-list altindadir.
"""

from __future__ import annotations

import os
import re
from pathlib import Path, PurePath

RESERVED_WINDOWS_NAMES = frozenset(
    {
        "con",
        "prn",
        "aux",
        "nul",
        *(f"com{i}" for i in range(1, 10)),
        *(f"lpt{i}" for i in range(1, 10)),
    }
)

_CONTROL_CHARS = re.compile(r"[\x00-\x1f]")
_WINDOWS_INVALID = re.compile(r'[<>:"|?*]')
_WINDOWS_ABS = re.compile(r"^[a-zA-Z]:[\\/]")


class UnsafePathError(ValueError):
    """Guvenli olmayan yol / dosya adi."""


def is_safe_file_name(name: str) -> bool:
    """Tek bir dosya adi guvenli mi (ayirici, traversal, gecersiz karakter yok)."""
    if not name or len(name) > 255:
        return False
    if re.search(r"[\\/]", name):
        return False
    if name in {".", ".."}:
        return False
    if _CONTROL_CHARS.search(name) or _WINDOWS_INVALID.search(name):
        return False
    if name.split(".")[0].lower() in RESERVED_WINDOWS_NAMES:
        return False
    return not name.endswith((".", " "))


def sanitize_file_name(name: str, fallback: str = "dosya") -> str:
    """Gelen adi guvenli tek segmente indirger; asla dizin ayirici birakmaz."""
    leaf = re.split(r"[\\/]", name or "")[-1]
    leaf = _CONTROL_CHARS.sub("", leaf)
    leaf = _WINDOWS_INVALID.sub("_", leaf)
    leaf = re.sub(r"\s+", " ", leaf).strip()
    leaf = leaf.rstrip(". ")
    if not leaf or leaf in {".", ".."}:
        return fallback
    stem, dot, ext = leaf.partition(".")
    if stem.lower() in RESERVED_WINDOWS_NAMES:
        leaf = f"_{stem}{dot}{ext}"
    return leaf[:255]


def validate_folder_path(value: str) -> str:
    """Mutlak, traversal'siz, UNC olmayan klasor yolunu normalize eder.

    Gecersizse `UnsafePathError` firlatir.
    """
    if not isinstance(value, str):
        raise UnsafePathError("Yol bir metin olmalidir.")
    raw = value.strip()
    if not raw:
        raise UnsafePathError("Yol bos olamaz.")
    if len(raw) > 400:
        raise UnsafePathError("Yol cok uzun (maks. 400 karakter).")
    if _CONTROL_CHARS.search(raw):
        raise UnsafePathError("Yol kontrol karakteri iceremez.")
    if re.match(r"^[\\/]{2}", raw):
        raise UnsafePathError("Ag paylasimi (UNC) yollari desteklenmiyor.")
    if raw.startswith(("\\\\?\\", "\\\\.\\")):
        raise UnsafePathError("Uzatilmis cihaz yollari desteklenmiyor.")

    is_windows = bool(_WINDOWS_ABS.match(raw))
    is_posix = raw.startswith("/")
    if not is_windows and not is_posix:
        raise UnsafePathError("Yol mutlak olmalidir (orn. D:\\DSI\\Belgeler veya /srv/depo).")

    parts = re.split(r"[\\/]+", raw)
    head = parts.pop(0) if is_windows else ""
    if is_posix and parts and parts[0] == "":
        parts.pop(0)

    segments: list[str] = []
    for seg in parts:
        if seg == "":
            continue
        if seg == ".":
            raise UnsafePathError("Yol '.' segmenti iceremez.")
        if seg == "..":
            raise UnsafePathError("Yol '..' (ust dizin) iceremez.")
        if is_windows:
            if _WINDOWS_INVALID.search(seg):
                raise UnsafePathError(f"Gecersiz karakter iceren segment: {seg}")
            if seg.split(".")[0].lower() in RESERVED_WINDOWS_NAMES:
                raise UnsafePathError(f"Ayrilmis Windows adi kullanilamaz: {seg}")
            if seg.endswith((".", " ")):
                raise UnsafePathError("Segment nokta veya bosluk ile bitemez.")
        segments.append(seg)

    if is_windows:
        drive = head[:2].upper()
        return f"{drive}\\" + "\\".join(segments) if segments else f"{drive}\\"
    return "/" + "/".join(segments)


def _real(path: Path) -> Path:
    """Symlink/junction'lari cozerek gercek yolu dondurur (var olmayan yollar dahil)."""
    try:
        return Path(os.path.realpath(str(path)))
    except OSError:
        return path.absolute()


def is_within(child: Path, root: Path) -> bool:
    """`child` gercekten `root` altinda mi? Symlink kacisi dahil kontrol edilir."""
    try:
        c = _real(child)
        r = _real(root)
    except OSError:
        return False
    if os.name == "nt":
        # Windows'ta surucu harfi ve buyuk/kucuk harf duyarsizligi normalize edilir.
        c_cmp = PurePath(str(c).lower())
        r_cmp = PurePath(str(r).lower())
    else:
        c_cmp, r_cmp = PurePath(c), PurePath(r)
    return c_cmp == r_cmp or r_cmp in c_cmp.parents


def resolve_within_roots(target_dir: str, roots: list[Path]) -> Path:
    """Hedef klasoru dogrular ve allow-list koklerinden birinin altinda oldugunu garanti eder."""
    if not roots:
        raise UnsafePathError("Yazma icin izin verilen kok klasor tanimli degil.")
    normalized = validate_folder_path(target_dir)
    candidate = Path(normalized)
    if not candidate.is_absolute():
        raise UnsafePathError("Hedef klasor mutlak olmalidir.")
    for root in roots:
        if is_within(candidate, root):
            return candidate
    raise UnsafePathError(f"Hedef klasor izin listesinin disinda: {normalized}")


def safe_join(target_dir: Path, file_name: str, roots: list[Path]) -> Path:
    """Dosya adini hedef klasore guvenli sekilde ekler; sonuc yine allow-list altinda olmalidir."""
    leaf = sanitize_file_name(file_name)
    if not is_safe_file_name(leaf):
        raise UnsafePathError(f"Gecersiz dosya adi: {file_name}")
    final = target_dir / leaf
    for root in roots:
        if is_within(final, root):
            return final
    raise UnsafePathError("Hedef dosya izin listesinin disinda.")
