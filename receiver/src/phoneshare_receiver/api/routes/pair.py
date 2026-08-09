"""POST /api/pair, POST /api/pair/confirm (PRD §12/§13)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core import addresses as address_detect
from ...core.state import ReceiverState
from ...models import Device
from ...schemas import (
    PairConfirmRequest,
    PairConfirmResponse,
    PairStartResponse,
    ReceiverAddressResponse,
    SessionResponse,
)
from ...services import pairing
from ..deps import (
    SESSION_COOKIE,
    current_device,
    get_session,
    get_state,
    pairing_rate_limit,
    require_loopback_client,
)

router = APIRouter(tags=["pairing"])


@router.post("/pair", response_model=PairStartResponse)
async def start_pair(
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
    _: None = Depends(pairing_rate_limit),
    __: None = Depends(require_loopback_client),
) -> PairStartResponse:
    """PC tarafindan (tray/masaustu/yerel panel) cagrilir; 5 dk gecerli kod + QR uretir.

    YALNIZCA loopback istemciler cagirabilir: aksi halde agdaki herkes kendine gecerli
    eslestirme kodu uretebilirdi (PRD §48/§49).

    Adres, istekten (Host/base_url) DEGIL, receiver'in gercek dinledigi port ve ag
    arayuzlerinden turetilir (PRD §12/§47).
    """
    ticket = await pairing.start_pairing(
        session,
        addresses=address_detect.current_addresses(state.config),
        device_name=state.config.device_name,
    )
    return PairStartResponse(
        code=ticket.code,
        expires_at=ticket.expires_at,
        qr_payload=ticket.qr_payload,
        addresses=[ReceiverAddressResponse(**item.to_dict()) for item in ticket.addresses],
    )


@router.post("/pair/confirm", response_model=PairConfirmResponse)
async def confirm_pair(
    payload: PairConfirmRequest,
    request: Request,
    response: Response,
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
    _: None = Depends(pairing_rate_limit),
) -> PairConfirmResponse:
    """Telefon kodu tuketir; token YALNIZCA burada bir kez doner, DB'de hash saklanir."""
    result = await pairing.confirm_pairing(
        session, code=payload.code, device_name=payload.device_name
    )
    await state.hub.broadcast("device.paired", {"device_id": result.device_id})
    response.set_cookie(
        SESSION_COOKIE,
        result.token,
        max_age=365 * 24 * 60 * 60,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
    )
    return PairConfirmResponse(
        device_id=result.device_id,
        token=result.token,
        device_name=result.device_name,
    )


@router.get("/session", response_model=SessionResponse)
async def current_session(device: Device = Depends(current_device)) -> SessionResponse:
    """Safari'den ana ekran PWA'sina kopyalanan cookie ile oturumu geri yukler."""
    return SessionResponse(device_id=device.id, device_name=device.name)
