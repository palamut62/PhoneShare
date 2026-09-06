"""FastAPI bagimliliklar: durum, oturum, kimlik dogrulama, hiz limiti."""

from __future__ import annotations

import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from ipaddress import ip_address

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ReceiverError
from ..core.ratelimit import RateLimitError
from ..core.state import ReceiverState
from ..models import Device
from ..security import audit
from ..security.tokens import AuthError, extract_bearer, hash_token

SESSION_COOKIE = "phoneshare_session"
LOCAL_ADMIN_COOKIE = "phoneshare_local_admin"
LOCAL_TOKEN_HEADER = "X-PhoneShare-Local-Token"


def get_state(request: Request) -> ReceiverState:
    state: ReceiverState = request.app.state.receiver
    return state


async def get_session(
    state: ReceiverState = Depends(get_state),
) -> AsyncIterator[AsyncSession]:
    async with state.db.session() as session:
        try:
            yield session
        except (HTTPException, ReceiverError):
            # Authentication/audit failures are intentional response paths and
            # their audit rows must survive the 4xx response.
            await session.commit()
            raise
        except Exception:
            await session.rollback()
            raise
        else:
            await session.commit()


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


def _host_is_loopback(request: Request, state: ReceiverState) -> bool:
    host = request.headers.get("host", "")
    expected_port = state.management_port or state.config.port
    return host in {f"127.0.0.1:{expected_port}", f"localhost:{expected_port}", f"[::1]:{expected_port}"}


def local_capability_valid(request: Request, state: ReceiverState) -> bool:
    supplied = request.headers.get(LOCAL_TOKEN_HEADER)
    return bool(supplied and state.local_capability and secrets.compare_digest(supplied, state.local_capability))


def local_browser_request_valid(request: Request, state: ReceiverState) -> bool:
    if not is_loopback_client(request) or not _host_is_loopback(request, state):
        return False
    origin = request.headers.get("origin")
    expected = f"http://127.0.0.1:{state.management_port or state.config.port}"
    if origin:
        return origin == expected
    return request.headers.get("sec-fetch-site", "").lower() == "same-origin"


async def require_local_admin(
    request: Request,
    state: ReceiverState = Depends(get_state),
) -> None:
    if state.local_session_valid(request.cookies.get(LOCAL_ADMIN_COOKIE)) and local_browser_request_valid(request, state):
        return
    if local_capability_valid(request, state) and is_loopback_client(request):
        return
    raise HTTPException(status_code=401, detail="Yerel yonetim yetkisi gerekli.")


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
    if state.local_session_valid(request.cookies.get(LOCAL_ADMIN_COOKIE)) and local_browser_request_valid(request, state):
        return None
    if local_capability_valid(request, state) and is_loopback_client(request):
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
