"""SQLite (aiosqlite) baglantisi."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..models import Base


def sqlite_url(path: str) -> str:
    return f"sqlite+aiosqlite:///{path}"


class Database:
    """Async engine + session fabrikasi."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.engine: AsyncEngine = create_async_engine(url, future=True, echo=False)
        self.session_factory = async_sessionmaker(self.engine, expire_on_commit=False)

        @event.listens_for(self.engine.sync_engine, "connect")
        def _pragmas(dbapi_conn, _record) -> None:  # pragma: no cover - baglanti kancasi
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    async def create_all(self) -> None:
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Older installations were created with create_all and have no
            # alembic stamp.  These additions are intentionally additive.
            columns = (await conn.execute(text("PRAGMA table_info(uploads)"))).mappings().all()
            present = {row["name"] for row in columns}
            additions = {
                "requested_target_id": "VARCHAR(64)",
                "resolved_filename": "VARCHAR(512)",
                "conflict_policy": "VARCHAR(16)",
                "decision_fingerprint": "VARCHAR(64)",
            }
            for name, sql_type in additions.items():
                if name not in present:
                    await conn.execute(text(f"ALTER TABLE uploads ADD COLUMN {name} {sql_type}"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_uploads_decision_fingerprint ON uploads (decision_fingerprint)"))

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.session_factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()
