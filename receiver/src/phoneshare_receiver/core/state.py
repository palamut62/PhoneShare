"""Receiver calisma zamani durumu (tek surum, tek surec)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from ..database import Database, sqlite_url
from ..services.ws import ProgressHub
from ..storage.temp import TempStore
from .config import ReceiverConfig, data_dir
from .ratelimit import ByteRateLimiter, RequestRateLimiter


class ReceiverState:
    """Uygulama omru boyunca yasayan paylasimli nesneler."""

    def __init__(self, config: ReceiverConfig, base_dir: Path | None = None) -> None:
        self.config = config
        self.base_dir = Path(base_dir) if base_dir else data_dir()
        self.base_dir.mkdir(parents=True, exist_ok=True)

        self.db = Database(sqlite_url((self.base_dir / "phoneshare.db").as_posix()))
        self.temp_store = TempStore(config.temp_dir())
        self.hub = ProgressHub()
        self.requests = RequestRateLimiter(limit=config.rate_limit_requests_per_min, window=60.0)
        # Eslestirme icin cok daha siki limit (PRD §83 brute force).
        self.pairing_requests = RequestRateLimiter(limit=10, window=60.0)
        self.bytes = ByteRateLimiter(config.rate_limit_bytes_per_sec)
        self.started_at = datetime.now(tz=UTC)

    async def startup(self) -> None:
        self.temp_store.root.mkdir(parents=True, exist_ok=True)
        await self.db.create_all()
        await self._seed_default_target()

    async def _seed_default_target(self) -> None:
        """Ana klasor secilmisse `Genel` hedefini bir kez olusturur (PRD §10/§20)."""
        if not self.config.base_folder:
            return
        from sqlalchemy import select

        from ..models import Target

        async with self.db.session() as session:
            existing = (await session.execute(select(Target).limit(1))).scalar_one_or_none()
            if existing is not None:
                return
            root = Path(self.config.base_folder)
            root.mkdir(parents=True, exist_ok=True)
            session.add(
                Target(id="genel", name="Genel", path=str(root), favorite=True, enabled=True)
            )
            await session.commit()

    async def shutdown(self) -> None:
        await self.db.dispose()
