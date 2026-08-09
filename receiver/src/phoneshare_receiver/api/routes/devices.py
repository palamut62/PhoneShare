"""GET /api/devices, DELETE /api/devices/{id} (PRD §13/§57)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import NotFoundError
from ...models import Device
from ...schemas import DeviceResponse
from ...security import audit
from ..deps import current_device_or_loopback, get_session

router = APIRouter(tags=["devices"])


@router.get("/devices", response_model=list[DeviceResponse])
async def list_devices(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> list[Device]:
    return list(
        (await session.execute(select(Device).order_by(Device.created_at.desc()))).scalars().all()
    )


@router.delete("/devices/{device_id}", status_code=204)
async def remove_device(
    device_id: str,
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Cihaz kaydini siler; token aninda gecersizlesir."""
    target = await session.get(Device, device_id)
    if target is None:
        raise NotFoundError("Cihaz bulunamadi.")
    await session.delete(target)
    await session.flush()
    await audit.record_audit(session, audit.DEVICE_REMOVED, device_id=device_id)
    return Response(status_code=204)
