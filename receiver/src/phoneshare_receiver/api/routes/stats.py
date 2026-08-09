"""/api/stats — transfer istatistikleri (PRD §42/§43)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...models import Device, Target, Transfer
from ...schemas import (
    StatsDailyPoint,
    StatsDevice,
    StatsFileType,
    StatsPeriod,
    StatsResponse,
    StatsTarget,
)
from ..deps import current_device_or_loopback, get_session

router = APIRouter(prefix="/stats", tags=["stats"])

#: PRD §42 — yalnizca COMPLETED transferler sayilir.
COMPLETED = "COMPLETED"

#: PRD §43 — gunluk seri uzunlugu.
DAILY_WINDOW = 14

#: MIME tipi bilinmiyorsa grup adi.
UNKNOWN_MIME = "application/octet-stream"


async def _period_stats(session: AsyncSession, since: datetime | None) -> StatsPeriod:
    """Bir zaman penceresindeki COMPLETED transfer ozetleri (PRD §42)."""
    stmt = select(
        func.count(Transfer.id),
        func.coalesce(func.sum(Transfer.size), 0),
        func.avg(Transfer.average_speed),
    ).where(Transfer.status == COMPLETED)
    if since is not None:
        stmt = stmt.where(Transfer.started_at >= since)
    files, total_bytes, avg_speed = (await session.execute(stmt)).one()
    return StatsPeriod(
        files=int(files),
        bytes=int(total_bytes),
        avg_speed=float(avg_speed) if avg_speed is not None else None,
    )


async def _daily_series(session: AsyncSession, today_start: datetime) -> list[StatsDailyPoint]:
    """PRD §43 — son 14 gunun surekli serisi; eksik gunler sifir doldurulur."""
    start = today_start - timedelta(days=DAILY_WINDOW - 1)
    rows = (
        await session.execute(
            select(
                func.date(Transfer.started_at),
                func.count(Transfer.id),
                func.coalesce(func.sum(Transfer.size), 0),
            )
            .where(Transfer.status == COMPLETED, Transfer.started_at >= start)
            .group_by(func.date(Transfer.started_at))
        )
    ).all()
    by_day = {str(day): (files, total_bytes) for day, files, total_bytes in rows}
    daily: list[StatsDailyPoint] = []
    cursor = start
    while len(daily) < DAILY_WINDOW:
        key = cursor.date().isoformat()
        files, total_bytes = by_day.get(key, (0, 0))
        daily.append(StatsDailyPoint(date=key, files=files, bytes=total_bytes))
        cursor += timedelta(days=1)
    return daily


async def _top_targets(session: AsyncSession) -> list[StatsTarget]:
    """PRD §42 — hedefe gore dagilim; silinen hedefte ad yerine id doner."""
    rows = (
        await session.execute(
            select(
                Transfer.target_id,
                Target.name,
                func.count(Transfer.id),
                func.coalesce(func.sum(Transfer.size), 0),
            )
            .outerjoin(Target, Target.id == Transfer.target_id)
            .where(Transfer.status == COMPLETED, Transfer.target_id.isnot(None))
            .group_by(Transfer.target_id)
            .order_by(func.sum(Transfer.size).desc())
            .limit(5)
        )
    ).all()
    return [
        StatsTarget(
            target_id=target_id,
            name=name or target_id,
            files=int(files),
            bytes=int(total_bytes),
        )
        for target_id, name, files, total_bytes in rows
    ]


async def _file_types(session: AsyncSession) -> list[StatsFileType]:
    """PRD §42 — MIME tipine gore dagilim; NULL tip "application/octet-stream" sayilir."""
    mime_expr = func.coalesce(Transfer.mime_type, UNKNOWN_MIME)
    rows = (
        await session.execute(
            select(
                mime_expr,
                func.count(Transfer.id),
                func.coalesce(func.sum(Transfer.size), 0),
            )
            .where(Transfer.status == COMPLETED)
            .group_by(mime_expr)
            .order_by(func.sum(Transfer.size).desc())
            .limit(8)
        )
    ).all()
    return [
        StatsFileType(mime_type=mime_type, files=int(files), bytes=int(total_bytes))
        for mime_type, files, total_bytes in rows
    ]


async def _by_device(session: AsyncSession) -> list[StatsDevice]:
    """PRD §42 — cihaza gore dagilim; silinen cihazda ad yerine id doner."""
    rows = (
        await session.execute(
            select(
                Transfer.device_id,
                Device.name,
                func.count(Transfer.id),
                func.coalesce(func.sum(Transfer.size), 0),
            )
            .outerjoin(Device, Device.id == Transfer.device_id)
            .where(Transfer.status == COMPLETED, Transfer.device_id.isnot(None))
            .group_by(Transfer.device_id)
            .order_by(func.sum(Transfer.size).desc())
            .limit(5)
        )
    ).all()
    return [
        StatsDevice(
            device_id=device_id,
            name=name or device_id,
            files=int(files),
            bytes=int(total_bytes),
        )
        for device_id, name, files, total_bytes in rows
    ]


@router.get("", response_model=StatsResponse)
async def get_stats(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> StatsResponse:
    """PRD §42/§43 — istatistik ozeti. Gun sinirlari UTC ile hesaplanir."""
    now = datetime.now(tz=UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return StatsResponse(
        today=await _period_stats(session, today_start),
        week=await _period_stats(session, now - timedelta(days=7)),
        month=await _period_stats(session, now - timedelta(days=30)),
        total=await _period_stats(session, None),
        daily=await _daily_series(session, today_start),
        top_targets=await _top_targets(session),
        file_types=await _file_types(session),
        by_device=await _by_device(session),
    )
