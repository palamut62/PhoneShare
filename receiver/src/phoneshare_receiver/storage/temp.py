"""Gecici chunk deposu (PRD §30).

Chunk'lar `<ana_klasor>\\.temp\\<upload_id>\\<index>.part` altinda birikir; dosya
tamamlanip SHA-256 dogrulanmadan nihai klasore ASLA yazilmaz.
"""

from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

CHUNK_READ_SIZE = 1024 * 1024


class TempStore:
    """Upload basina izole gecici dizin yonetimi."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def upload_dir(self, upload_id: str) -> Path:
        # upload_id her zaman sunucunun urettigi hex/uuid'dir; yine de sertlestirilir.
        safe = "".join(ch for ch in upload_id if ch.isalnum() or ch in "-_")
        if not safe:
            raise ValueError("Gecersiz upload kimligi.")
        return self.root / safe

    def chunk_path(self, upload_id: str, index: int) -> Path:
        if index < 0:
            raise ValueError("Chunk indeksi negatif olamaz.")
        return self.upload_dir(upload_id) / f"{index:08d}.part"

    def ensure(self, upload_id: str) -> Path:
        directory = self.upload_dir(upload_id)
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def write_chunk(self, upload_id: str, index: int, data: bytes) -> Path:
        """Chunk'i atomik yazar (once .tmp, sonra `os.replace`) — idempotenttir."""
        self.ensure(upload_id)
        final = self.chunk_path(upload_id, index)
        tmp = final.with_suffix(".tmp")
        with open(tmp, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, final)
        return final

    def has_chunk(self, upload_id: str, index: int) -> bool:
        return self.chunk_path(upload_id, index).exists()

    def existing_chunks(self, upload_id: str, total: int) -> list[int]:
        return [i for i in range(total) if self.has_chunk(upload_id, i)]

    def assemble(self, upload_id: str, total_chunks: int) -> tuple[Path, str, int]:
        """Chunk'lari sirayla birlestirir; (yol, sha256, boyut) dondurur."""
        directory = self.ensure(upload_id)
        assembled = directory / "assembled.part"
        digest = hashlib.sha256()
        size = 0
        with open(assembled, "wb") as out:
            for index in range(total_chunks):
                part = self.chunk_path(upload_id, index)
                if not part.exists():
                    raise FileNotFoundError(f"Eksik parca: {index}")
                with open(part, "rb") as src:
                    while True:
                        block = src.read(CHUNK_READ_SIZE)
                        if not block:
                            break
                        digest.update(block)
                        size += len(block)
                        out.write(block)
            out.flush()
            os.fsync(out.fileno())
        return assembled, digest.hexdigest(), size

    def cleanup(self, upload_id: str) -> None:
        shutil.rmtree(self.upload_dir(upload_id), ignore_errors=True)


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
