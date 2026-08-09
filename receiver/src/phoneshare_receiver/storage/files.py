"""Hedef klasore yazim: cakisma politikasi (PRD §17) ve atomik tasima."""

from __future__ import annotations

import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from ..security.paths import is_within, sanitize_file_name


class DiskQuotaError(Exception):
    """Kota veya disk alani yetersiz."""


@dataclass(frozen=True, slots=True)
class PlacementResult:
    """Cakisma politikasi uygulandiktan sonraki nihai karar."""

    path: Path | None
    file_name: str | None
    skipped: bool
    overwritten: bool


def _split_name(file_name: str) -> tuple[str, str]:
    """'rapor.tar.gz' -> ('rapor.tar', '.gz'); uzantisizda ('LICENSE', '')."""
    idx = file_name.rfind(".")
    if idx <= 0:
        return file_name, ""
    return file_name[:idx], file_name[idx:]


_VERSION_SUFFIX = re.compile(r"_v(\d+)$")


def plan_placement(
    target_dir: Path,
    file_name: str,
    policy: str,
    max_attempts: int = 10_000,
) -> PlacementResult:
    """Cakisma politikasina gore nihai dosya yolunu belirler.

    overwrite -> ayni ad, uzerine yazilir
    skip      -> dosya varsa hic yazilmaz
    version   -> dosya_v2.pdf, dosya_v3.pdf ...
    rename    -> dosya (1).pdf, dosya (2).pdf ...
    """
    leaf = sanitize_file_name(file_name)
    candidate = target_dir / leaf

    if not candidate.exists():
        return PlacementResult(candidate, leaf, skipped=False, overwritten=False)

    if policy == "overwrite":
        return PlacementResult(candidate, leaf, skipped=False, overwritten=True)

    if policy == "skip":
        return PlacementResult(None, None, skipped=True, overwritten=False)

    stem, ext = _split_name(leaf)

    if policy == "version":
        # Zaten "_v2" ile bitiyorsa numaradan devam edilir.
        m = _VERSION_SUFFIX.search(stem)
        base = stem[: m.start()] if m else stem
        start = int(m.group(1)) + 1 if m else 2
        for n in range(start, start + max_attempts):
            name = f"{base}_v{n}{ext}"
            path = target_dir / name
            if not path.exists():
                return PlacementResult(path, name, skipped=False, overwritten=False)
        raise FileExistsError("Versiyon numarasi uretilemedi.")

    # policy == "rename" (varsayilan)
    for n in range(1, max_attempts + 1):
        name = f"{stem} ({n}){ext}"
        path = target_dir / name
        if not path.exists():
            return PlacementResult(path, name, skipped=False, overwritten=False)
    raise FileExistsError("Benzersiz dosya adi uretilemedi.")


def ensure_capacity(target_dir: Path, size_bytes: int, quota_bytes: int = 0) -> None:
    """Disk bos alani ve (varsa) toplam kota kontrolu."""
    probe = target_dir
    while not probe.exists() and probe.parent != probe:
        probe = probe.parent
    try:
        usage = shutil.disk_usage(str(probe))
    except OSError as exc:
        raise DiskQuotaError(f"Disk bilgisi okunamadi: {exc}") from exc

    # Dosyanin kendisi + %1 emniyet payi.
    needed = size_bytes + max(16 * 1024 * 1024, size_bytes // 100)
    if usage.free < needed:
        raise DiskQuotaError(
            f"Disk alani yetersiz: gerekli ~{needed} bayt, bos {usage.free} bayt."
        )

    if quota_bytes > 0:
        used = _dir_size(target_dir)
        if used + size_bytes > quota_bytes:
            raise DiskQuotaError(
                f"Disk kotasi asilacak: kullanilan {used}, kota {quota_bytes} bayt."
            )


def _dir_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
    return total


def atomic_move(source: Path, destination: Path, allowed_roots: list[Path]) -> Path:
    """Ayni volume'de `os.replace` (atomik); farkli volume'de kopyala-degistir-sil.

    Hedefin allow-list altinda oldugu son bir kez daha dogrulanir (TOCTOU savunmasi).
    """
    if allowed_roots and not any(is_within(destination, root) for root in allowed_roots):
        raise PermissionError("Hedef yol izin listesinin disinda.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.replace(source, destination)
        return destination
    except OSError:
        # Farkli surucu/volume: gecici ada kopyalayip atomik olarak yerine koy.
        tmp = destination.with_name(destination.name + ".incoming")
        shutil.copyfile(source, tmp)
        os.replace(tmp, destination)
        source.unlink(missing_ok=True)
        return destination
