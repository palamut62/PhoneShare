"""WebSocket /api/ws (PRD §46).

Yayinlanan olaylar: `receiver.online`, `transfer.started`, `transfer.progress`,
`transfer.completed`, `transfer.failed`, `device.paired`.
Token query parametresi ile dogrulanir (tarayici WebSocket'i ozel baslik gonderemez).
"""

from __future__ import annotations

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ... import __version__
from ...models import Device
from ...security.tokens import hash_token

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")) -> None:
    state = websocket.app.state.receiver
    token = token or websocket.cookies.get("phoneshare_session", "")
    is_loopback = bool(websocket.client and websocket.client.host in {"127.0.0.1", "::1"})
    if not token and not is_loopback:
        await websocket.close(code=4401)
        return

    device = None
    if token:
        async with state.db.session() as session:
            device = (
                await session.execute(select(Device).where(Device.token_hash == hash_token(token)))
            ).scalar_one_or_none()

    if token and (device is None or not device.enabled):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    await state.hub.connect(websocket, device.id if device else None)
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
