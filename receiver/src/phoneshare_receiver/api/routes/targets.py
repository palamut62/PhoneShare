"""/api/targets — sanal hedefler (PRD §20/§35/§36/§57).

Yanitlarda gercek Windows yolu YOKTUR (PRD §93).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.state import ReceiverState
from ...models import Device, Target
from ...schemas import TargetCreateRequest, TargetResponse, TargetUpdateRequest
from ...services import targets as targets_service
from ..deps import current_device_or_loopback, get_session, get_state

router = APIRouter(tags=["targets"])


@router.get("/targets", response_model=list[TargetResponse])
async def list_targets(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> list[Target]:
    return await targets_service.list_targets(session, only_enabled=True)


@router.post("/targets", response_model=TargetResponse, status_code=201)
async def create_target(
    payload: TargetCreateRequest,
    _device: Device | None = Depends(current_device_or_loopback),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> Target:
    return await targets_service.create_target(
        session,
        state.config,
        name=payload.name,
        path=payload.path,
        icon=payload.icon,
        favorite=payload.favorite,
        enabled=payload.enabled,
    )


@router.put("/targets/{target_id}", response_model=TargetResponse)
async def update_target(
    target_id: str,
    payload: TargetUpdateRequest,
    _device: Device | None = Depends(current_device_or_loopback),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> Target:
    return await targets_service.update_target(
        session,
        state.config,
        target_id,
        name=payload.name,
        path=payload.path,
        icon=payload.icon,
        favorite=payload.favorite,
        enabled=payload.enabled,
    )


@router.delete("/targets/{target_id}", status_code=204)
async def delete_target(
    target_id: str,
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await targets_service.delete_target(session, target_id)
    return Response(status_code=204)
