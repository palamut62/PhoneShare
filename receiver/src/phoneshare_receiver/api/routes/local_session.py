"""Narrow loopback-browser bootstrap for the desktop management listener."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from ..deps import (
    LOCAL_ADMIN_COOKIE,
    get_state,
    is_loopback_client,
    local_browser_request_valid,
    local_capability_valid,
)

router = APIRouter(tags=["local-session"])


@router.post("/local-session")
async def create_local_session(request: Request, response: Response, state=Depends(get_state)) -> dict[str, bool]:
    if not is_loopback_client(request):
        raise HTTPException(status_code=403, detail="Yerel baglanti gerekli.")
    if not (local_browser_request_valid(request, state) or local_capability_valid(request, state)):
        raise HTTPException(status_code=403, detail="Yerel kaynak dogrulanamadi.")
    response.set_cookie(LOCAL_ADMIN_COOKIE, state.issue_local_session(), httponly=True, samesite="strict", secure=False)
    return {"authenticated": True}
