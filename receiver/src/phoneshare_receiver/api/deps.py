"""FastAPI bagimliliklar: durum, oturum, kimlik dogrulama, hiz limiti."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from ipaddress import ip_address

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.ratelimit import RateLimitError
from ..core.state import ReceiverState
from ..models import Device
from ..security import audit
from ..security.tokens import AuthError, extract_bearer, hash_token

SESSION_COOKIE = "phoneshare_session"


def get_state(request: Request) -> ReceiverState:
    state: ReceiverState = request.app.state.receiver
    return state


async def get_session(
    state: ReceiverState = Depends(get_state),
) -> AsyncIterator[AsyncSession]:
    async with state.db.session() as session:
        try:
            yield session
        finally:
            # Hata yollarinda da denetim kaydi ve FAILED durumlari kalici olmalidir.
            try:
                await session.commit()
            except Exception:  # pragma: no cover - bozuk oturum
                await session.rollback()


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


#: Yalnizca gercek soket adresi kabul edilir; X-Forwarded-For gibi basliklara GUVENILMEZ.
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "::ffff:127.0.0.1", "localhost"})


def is_loopback_client(request: Request) -> bool:
    """Istek bu makinenin kendisinden mi geliyor? (PC paneli / Tauri kabugu)

    Kaynak olarak SADECE `request.client.host` (gercek TCP peer) kullanilir; proxy
    basliklari spoof edilebilecegi icin dikkate alinmaz.
    """
    if request.client is None:
        return False
    host = request.client.host
    if host in _LOOPBACK_HOSTS:
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def require_loopback_client(request: Request) -> None:
    """PRD §48/§49 — eslestirme kodu uretimi yalnizca PC'nin kendi panelinden yapilir."""
    if not is_loopback_client(request):
        raise HTTPException(
            status_code=403,
            detail="Eslestirme kodu yalnizca bilgisayarin kendi PhoneShare penceresinden olusturulabilir.",
        )


async def current_device(
    request: Request,
    authorization: str | None = Header(default=None),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> Device:
    """`Authorization: Bearer <token>` -> aktif cihaz. Token hash ile karsilastirilir."""
    token = request.cookies.get(SESSION_COOKIE)
    if authorization:
        try:
            token = extract_bearer(authorization)
        except AuthError as exc:
            await audit.record_audit(session, audit.AUTH_FAILED, detail={"reason": "invalid_bearer"})
            raise HTTPException(status_code=401, detail=exc.message) from exc
    if not token:
        await audit.record_audit(session, audit.AUTH_FAILED, detail={"reason": "missing_auth"})
        raise HTTPException(status_code=401, detail="Yetkisiz.")

    device = (
        await session.execute(select(Device).where(Device.token_hash == hash_token(token)))
    ).scalar_one_or_none()

    if device is None:
        await audit.record_audit(session, audit.AUTH_FAILED, detail={"reason": "unknown_token"})
        raise HTTPException(status_code=401, detail="Yetkisiz.")
    if not device.enabled:
        await audit.record_audit(
            session, audit.AUTH_FAILED, device_id=device.id, detail={"reason": "device_disabled"}
        )
        raise HTTPException(status_code=401, detail="Bu cihazin erisimi iptal edilmis.")

    try:
        state.requests.check(device.id)
    except RateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail="Cok fazla istek gonderildi, lutfen biraz bekleyin.",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc

    device.last_seen = datetime.now(tz=UTC)
    request.state.device_id = device.id
    return device


async def current_device_or_loopback(
    request: Request,
    authorization: str | None = Header(default=None),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> Device | None:
    """Telefon token'i veya gercek loopback masaustu paneli erisimi."""
    if is_loopback_client(request) and not authorization and not request.cookies.get(SESSION_COOKIE):
        return None
    return await current_device(request, authorization, state, session)


def pairing_rate_limit(
    request: Request,
    state: ReceiverState = Depends(get_state),
) -> None:
    """PRD §83 — eslestirme uclarinda siki IP bazli brute force korumasi."""
    try:
        state.pairing_requests.check(client_key(request))
    except RateLimitError as exc:
        raise HTTPException(
            status_code=429,
            detail="Cok fazla eslestirme denemesi. Lutfen biraz bekleyin.",
            headers={"Retry-After": str(exc.retry_after)},
        ) from exc
