"""Yerel yedekleme/geri yukleme (PRD "Yedekleme").

Kapsam: agent SQLite veritabani + `config.json`. Kullanicinin AKTARDIGI DOSYALAR
yedeklenmez (onlar zaten kullanicinin kendi klasorlerindedir ve GB'larca olabilir).

- Yedek tarih damgali tek bir `.zip` dosyasidir, YEREL klasore yazilir.
- SQLite tutarliligi icin `sqlite3` backup API'si kullanilir (canli DB kopyalamak
  bozuk dosya uretebilir).
- Saklama: en yeni `keep` adet yedek tutulur, eskiler silinir.
- Sirlar (`secrets.bin`) yedege DAHIL EDILMEZ; DPAPI ile makineye baglidir ve
  yedekten tasinmasi guvenlik riskidir. Geri yuklemeden sonra yeniden eslestirin.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import sqlite3
import tempfile
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .. import __version__
from ..core.config import AgentConfig, app_data_dir, backups_dir, config_file, data_dir
from ..core.config import db_path as core_db_path
from ..core.logging_setup import get_logger

log = get_logger("system")

MANIFEST_NAME = "manifest.json"
DB_ENTRY = "phoneshare.db"
CONFIG_ENTRY = "config.json"
#: Yedekten geri yuklenirken bu dosyalar ASLA yazilmaz (guvenlik).
EXCLUDED_ENTRIES = frozenset({"secrets.bin"})


class BackupError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class BackupRecord:
    file_name: str
    path: str
    size_bytes: int
    created_at: str
    agent_version: str = __version__

    def to_dict(self) -> dict:
        return {
            "fileName": self.file_name,
            "path": self.path,
            "sizeBytes": self.size_bytes,
            "createdAt": self.created_at,
            "agentVersion": self.agent_version,
        }


class BackupManager:
    """Yedek alma / listeleme / geri yukleme."""

    def __init__(
        self,
        db_path: Path | None = None,
        config_path: Path | None = None,
        backup_dir: Path | None = None,
        keep: int = 7,
    ) -> None:
        self.db_path = db_path or core_db_path()
        self.config_path = config_path or config_file()
        self.backup_dir = backup_dir or backups_dir()
        self.keep = max(1, keep)

    @classmethod
    def from_config(cls, config: AgentConfig, base_dir: Path | None = None) -> BackupManager:
        base = base_dir or data_dir()
        return cls(
            db_path=base / "phoneshare.db",
            config_path=config_file(),
            backup_dir=Path(config.backup_dir) if config.backup_dir else backups_dir(),
            keep=config.backup_keep,
        )

    # ------------------------------------------------------------------ #
    # Yedek alma                                                          #
    # ------------------------------------------------------------------ #

    async def run(self) -> BackupRecord:
        """Yedegi ayri bir thread'de alir (I/O yogun; event loop bloklanmaz)."""
        return await asyncio.to_thread(self.run_sync)

    def run_sync(self) -> BackupRecord:
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(tz=UTC).strftime("%Y%m%d-%H%M%S")
        archive = self.backup_dir / f"phoneshare-backup-{stamp}.zip"

        manifest = {
            "createdAt": datetime.now(tz=UTC).isoformat(),
            "agentVersion": __version__,
            "appDataDir": str(app_data_dir()),
            "entries": [],
        }

        tmp_db: Path | None = None
        try:
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
                if self.db_path.exists():
                    tmp_db = self._snapshot_db()
                    zf.write(tmp_db, DB_ENTRY)
                    manifest["entries"].append(DB_ENTRY)
                if self.config_path.exists():
                    zf.write(self.config_path, CONFIG_ENTRY)
                    manifest["entries"].append(CONFIG_ENTRY)
                zf.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False))
        except (OSError, zipfile.BadZipFile) as exc:
            archive.unlink(missing_ok=True)
            raise BackupError(f"Yedek olusturulamadi: {exc}") from exc
        finally:
            if tmp_db is not None:
                tmp_db.unlink(missing_ok=True)

        self.prune()
        record = BackupRecord(
            file_name=archive.name,
            path=str(archive),
            size_bytes=archive.stat().st_size,
            created_at=str(manifest["createdAt"]),
        )
        log.info(
            "Yedek alindi",
            extra={"category": "system", "file": record.file_name, "sizeBytes": record.size_bytes},
        )
        return record

    def _snapshot_db(self) -> Path:
        """SQLite backup API'si ile tutarli bir kopya alir."""
        tmp = Path(tempfile.mkdtemp(prefix="phoneshare-bak-")) / DB_ENTRY
        source = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        try:
            target = sqlite3.connect(str(tmp))
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()
        return tmp

    # ------------------------------------------------------------------ #
    # Listeleme / saklama                                                 #
    # ------------------------------------------------------------------ #

    def list(self) -> list[BackupRecord]:
        """En yeniden eskiye dogru yedek listesi."""
        if not self.backup_dir.exists():
            return []
        records: list[BackupRecord] = []
        for path in self.backup_dir.glob("phoneshare-backup-*.zip"):
            try:
                stat = path.stat()
            except OSError:
                continue
            records.append(
                BackupRecord(
                    file_name=path.name,
                    path=str(path),
                    size_bytes=stat.st_size,
                    created_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                )
            )
        return sorted(records, key=lambda r: r.created_at, reverse=True)

    def prune(self) -> list[str]:
        """`keep` sayisini asan eski yedekleri siler; silinenlerin adini dondurur."""
        removed: list[str] = []
        for record in self.list()[self.keep :]:
            try:
                Path(record.path).unlink()
                removed.append(record.file_name)
            except OSError as exc:
                log.warning(
                    "Eski yedek silinemedi",
                    extra={"category": "system", "file": record.file_name, "error": str(exc)},
                )
        return removed

    # ------------------------------------------------------------------ #
    # Geri yukleme                                                        #
    # ------------------------------------------------------------------ #

    def restore(self, archive: Path, target_data_dir: Path | None = None) -> list[str]:
        """Yedegi geri yukler. Agent DURDURULMUS olmalidir.

        Mevcut dosyalar `<ad>.pre-restore` olarak yedeklenir, boylece geri alinabilir.
        """
        archive = Path(archive)
        if not archive.exists():
            raise BackupError(f"Yedek dosyasi bulunamadi: {archive}")

        target_db_dir = target_data_dir or self.db_path.parent
        target_db_dir.mkdir(parents=True, exist_ok=True)
        restored: list[str] = []

        try:
            with zipfile.ZipFile(archive) as zf:
                names = set(zf.namelist())
                for entry, destination in (
                    (DB_ENTRY, target_db_dir / DB_ENTRY),
                    (CONFIG_ENTRY, self.config_path),
                ):
                    if entry not in names or entry in EXCLUDED_ENTRIES:
                        continue
                    if destination.exists():
                        shutil.copy2(destination, destination.with_suffix(
                            destination.suffix + ".pre-restore"
                        ))
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    # Zip-slip'e karsi: hedef yol arsivden DEGIL, bizim sabit
                    # eslememizden gelir; arsivdeki yollar kullanilmaz.
                    with zf.open(entry) as src, open(destination, "wb") as out:
                        shutil.copyfileobj(src, out)
                    restored.append(entry)
        except (OSError, zipfile.BadZipFile, KeyError) as exc:
            raise BackupError(f"Geri yukleme basarisiz: {exc}") from exc

        if not restored:
            raise BackupError("Yedek icinde geri yuklenebilir icerik yok.")
        log.info("Yedek geri yuklendi", extra={"category": "system", "entries": restored})
        return restored
