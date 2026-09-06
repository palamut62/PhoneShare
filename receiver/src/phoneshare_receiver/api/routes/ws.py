"""WebSocket /api/ws (PRD §46).

Yayinlanan olaylar: `receiver.online`, `transfer.started`, `transfer.progress`,
`transfer.completed`, `transfer.failed`, `device.paired`.
Token query parametresi ile dogrulanir (tarayici WebSocket'i ozel baslik gonderemez).
"""

from __future__ import annotations

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)

from ... import __version__
from ..deps import (
    current_device_or_loopback,
    get_state,
    local_browser_request_valid,
    local_capability_valid,
)

router = APIRouter()


@router.post("/ws-ticket")
async def create_ws_ticket(
    request: Request,
    principal=Depends(current_device_or_loopback),
    state=Depends(get_state),
) -> dict[str, str | int]:
    if principal is None and not (
        local_browser_request_valid(request, state) or local_capability_valid(request, state)
    ):
        raise HTTPException(status_code=401, detail="Yetkisiz.")
    identity = f"device:{principal.id}" if principal is not None else "local-admin"
    ticket, expires_in = await state.issue_ws_ticket(identity)
    return {"ticket": ticket, "expires_in": expires_in}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, ticket: str = Query(default="")) -> None:
    state = websocket.app.state.receiver
    principal = await state.consume_ws_ticket(ticket)
    if principal is None:
        await websocket.close(code=4401)
        return

    await websocket.accept()
    await state.hub.connect(websocket, principal)
    try:
        await websocket.send_json(
            {"event": "receiver.online", "data": {"version": __version__}}
        )
        while True:
            # Istemci mesajlari yalnizca baglantiyi canli tutmak icindir.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await state.hub.disconnect(websocket)
