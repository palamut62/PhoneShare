"""/api/settings (PRD §57).

`ai_enabled` ve `notify_enabled` MVP DISIDIR (PRD §76-78) ve varsayilan KAPALIDIR.
"""

from __future__ import annotations

import contextlib

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.config import sanitize_config, save_config
from ...core.errors import ForbiddenError
from ...core.state import ReceiverState
from ...models import Device
from ...schemas import SettingsResponse, SettingsUpdateRequest
from ...security import audit
from ..deps import current_device_or_loopback, get_session, get_state

router = APIRouter(tags=["settings"])

_FIELDS = (
    "device_name",
    "chunk_size",
    "max_file_bytes",
    "max_total_transfer_bytes",
    "conflict_policy",
    "naming_template",
    "remember_last_target",
    "telemetry_enabled",
    "ai_enabled",
    "notify_enabled",
    "remote_launch_enabled",
)


def _to_response(state: ReceiverState) -> SettingsResponse:
    cfg = state.config
    return SettingsResponse(**{name: getattr(cfg, name) for name in _FIELDS})


@router.get("/settings", response_model=SettingsResponse)
async def read_settings(
    _device: Device | None = Depends(current_device_or_loopback),
    state: ReceiverState = Depends(get_state),
) -> SettingsResponse:
    return _to_response(state)


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    payload: SettingsUpdateRequest,
    device: Device | None = Depends(current_device_or_loopback),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> SettingsResponse:
    if payload.remote_launch_enabled is not None and device is not None:
        raise ForbiddenError(
            "Bu ayar yalnizca bilgisayarin kendi PhoneShare panelinden degistirilebilir."
        )
    changed = payload.model_dump(exclude_none=True)
    for key, value in changed.items():
        setattr(state.config, key, value)
    state.config = sanitize_config(state.config)
    with contextlib.suppress(OSError):  # pragma: no cover - disk hatasi
        save_config(state.config)
    await audit.record_audit(
        session, audit.SETTINGS_CHANGED, detail={"keys": sorted(changed.keys())}
    )
    return _to_response(state)
