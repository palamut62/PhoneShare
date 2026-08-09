"""/api/transfers — transfer gecmisi (PRD §37/§38/§41/§57)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import NotFoundError
from ...models import Device, Transfer
from ...schemas import TransferListResponse, TransferResponse
from ..deps import current_device_or_loopback, get_session

router = APIRouter(prefix="/transfers", tags=["transfers"])


@router.get("", response_model=TransferListResponse)
async def list_transfers(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
    status: str | None = Query(default=None, max_length=16),
    target_id: str | None = Query(default=None, max_length=64),
    q: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TransferListResponse:
    stmt = select(Transfer)
    count_stmt = select(func.count()).select_from(Transfer)
    if status:
        stmt = stmt.where(Transfer.status == status)
        count_stmt = count_stmt.where(Transfer.status == status)
    if target_id:
        stmt = stmt.where(Transfer.target_id == target_id)
        count_stmt = count_stmt.where(Transfer.target_id == target_id)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(Transfer.original_filename.like(pattern))
        count_stmt = count_stmt.where(Transfer.original_filename.like(pattern))

    rows = (
        (
            await session.execute(
                stmt.order_by(Transfer.started_at.desc()).limit(limit).offset(offset)
            )
        )
        .scalars()
        .all()
    )
    total = int((await session.execute(count_stmt)).scalar_one())
    return TransferListResponse(
        items=[TransferResponse.model_validate(r, from_attributes=True) for r in rows],
        total=total,
    )


@router.get("/{transfer_id}", response_model=TransferResponse)
async def get_transfer(
    transfer_id: str,
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> Transfer:
    transfer = await session.get(Transfer, transfer_id)
    if transfer is None:
        raise NotFoundError("Transfer bulunamadi.")
    return transfer
