"""GET /api/health (PRD §45)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ... import __version__
from ...core import addresses as address_detect
from ...core.state import ReceiverState
from ...schemas import HealthResponse, ReceiverAddressResponse
from ..deps import get_state, is_loopback_client

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request, state: ReceiverState = Depends(get_state)) -> HealthResponse:
    """Kimlik dogrulama gerektirmez; PWA bagli olup olmadigini bununla anlar (PRD §44).

    `addresses`: panelin "telefonundan su adresi ac" diyebilmesi icin gercek
    erisilebilir adresler (PRD §44/§47). Sistem sorgulari onbelleklenir.

    `is_local_client`: istemci loopback'ten mi geliyor — PC paneli ile telefonu ayirmak
    icin tek yetkili kaynak (PRD §12). Proxy basliklarina bakilmaz.
    """
    detected = address_detect.current_addresses(state.config)
    return HealthResponse(
        status="online",
        version=__version__,
        device_name=state.config.device_name,
        addresses=[ReceiverAddressResponse(**item.to_dict()) for item in detected],
        is_local_client=is_loopback_client(request),
    )
