"""/api/apps — kayitli masaustu uygulamalari (uzaktan baslatici).

Yanitlarda gercek exe yolu YOKTUR. Kayit/silme yalnizca loopback'ten (PC paneli)
yapilabilir; telefon uzaktan uygulama KAYDEDEMEZ.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ForbiddenError
from ...core.state import ReceiverState
from ...models import App, Device
from ...schemas import AppCreateRequest, AppResponse
from ...services import apps as apps_service
from ..deps import current_device_or_loopback, get_session, get_state

router = APIRouter(tags=["apps"])


def _require_loopback(device: Device | None) -> None:
    if device is not None:
        raise ForbiddenError("Bu islem yalnizca bilgisayarin kendi PhoneShare panelinden yapilabilir.")


@router.get("/apps", response_model=list[AppResponse])
async def list_apps(
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> list[App]:
    return await apps_service.list_apps(session, only_enabled=True)


@router.post("/apps", response_model=AppResponse, status_code=201)
async def create_app(
    payload: AppCreateRequest,
    device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> App:
    _require_loopback(device)
    return await apps_service.create_app(
        session,
        name=payload.name,
        exe_path=payload.exe_path,
        args=payload.args,
    )


@router.delete("/apps/{app_id}", status_code=204)
async def delete_app(
    app_id: str,
    device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> Response:
    _require_loopback(device)
    await apps_service.delete_app(session, app_id)
    return Response(status_code=204)


@router.post("/apps/{app_id}/launch", response_model=AppResponse)
async def launch_app(
    app_id: str,
    _device: Device | None = Depends(current_device_or_loopback),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> App:
    return await apps_service.launch_app(session, state.config, app_id)
