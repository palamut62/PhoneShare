"""Receiver calisma zamani durumu (tek surum, tek surec)."""

from __future__ import annotations

import asyncio
import secrets
from datetime import UTC, datetime, timedelta
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
        self.local_capability: str | None = None
        self.management_port: int | None = None
        self._ws_tickets: dict[str, tuple[str, datetime]] = {}
        self._local_sessions: set[str] = set()
        self._ticket_lock = asyncio.Lock()
        self.upload_locks: dict[str, asyncio.Lock] = {}
        self.upload_locks_guard = asyncio.Lock()
        self.admission_lock = asyncio.Lock()
        self.requests = RequestRateLimiter(limit=config.rate_limit_requests_per_min, window=60.0)
        # Eslestirme icin cok daha siki limit (PRD §83 brute force).
        self.pairing_requests = RequestRateLimiter(limit=10, window=60.0)
        self.bytes = ByteRateLimiter(config.rate_limit_bytes_per_sec)
        self.started_at = datetime.now(tz=UTC)

    async def startup(self) -> None:
        self.temp_store.root.mkdir(parents=True, exist_ok=True)
        await self.db.create_all()
        await self._seed_default_target()

    async def issue_ws_ticket(self, principal: str) -> tuple[str, int]:
        ticket = secrets.token_urlsafe(32)
        expires = datetime.now(tz=UTC) + timedelta(seconds=30)
        async with self._ticket_lock:
            now = datetime.now(tz=UTC)
            self._ws_tickets = {key: value for key, value in self._ws_tickets.items() if value[1] > now}
            self._ws_tickets[ticket] = (principal, expires)
        return ticket, 30

    def issue_local_session(self) -> str:
        session = secrets.token_urlsafe(32)
        self._local_sessions.add(session)
        return session

    def local_session_valid(self, value: str | None) -> bool:
        return bool(value and value in self._local_sessions)

    async def consume_ws_ticket(self, ticket: str) -> str | None:
        async with self._ticket_lock:
            item = self._ws_tickets.pop(ticket, None)
        if item is None or item[1] <= datetime.now(tz=UTC):
            return None
        return item[0]

    async def revoke_principal(self, principal: str) -> None:
        async with self._ticket_lock:
            self._ws_tickets = {key: value for key, value in self._ws_tickets.items() if value[0] != principal}
        await self.hub.revoke(principal)

    async def upload_lock(self, upload_id: str) -> asyncio.Lock:
        async with self.upload_locks_guard:
            return self.upload_locks.setdefault(upload_id, asyncio.Lock())

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
        await self.hub.close()
        await self.db.dispose()
