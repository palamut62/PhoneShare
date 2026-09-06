"""WebSocket yayin merkezi (PRD §46): PC durumu, transfer ilerlemesi, cihaz olaylari (`/api/ws`)."""

from __future__ import annotations

import asyncio
import contextlib
from typing import Any

from ..core.logging_setup import get_logger

log = get_logger("api")


class ProgressHub:
    """Bagli istemcilere olay yayinlar. Yavas istemci digerlerini bloklamaz."""

    def __init__(self) -> None:
        self._clients: dict[Any, tuple[str, asyncio.Queue[dict[str, Any]], asyncio.Task[None]]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any, principal: str) -> None:
        async with self._lock:
            queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
            self._clients[websocket] = (principal, queue, asyncio.create_task(self._sender(websocket, queue)))

    async def _sender(self, websocket: Any, queue: asyncio.Queue[dict[str, Any]]) -> None:
        try:
            while True:
                await asyncio.wait_for(websocket.send_json(await queue.get()), timeout=10)
        except (asyncio.CancelledError, Exception):
            with contextlib.suppress(Exception):
                await websocket.close()

    async def disconnect(self, websocket: Any) -> None:
        async with self._lock:
            item = self._clients.pop(websocket, None)
        if item:
            item[2].cancel()

    async def revoke(self, principal: str) -> None:
        async with self._lock:
            targets = [socket for socket, item in self._clients.items() if item[0] == principal]
        for socket in targets:
            await self.disconnect(socket)
            with contextlib.suppress(Exception):
                await socket.close(code=4403)

    async def close(self) -> None:
        async with self._lock:
            sockets = list(self._clients)
        for socket in sockets:
            await self.disconnect(socket)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        async with self._lock:
            targets = list(self._clients)
        for client in targets:
            item = self._clients.get(client)
            if item is None:
                continue
            try:
                item[1].put_nowait(payload)
            except asyncio.QueueFull:
                await self.disconnect(client)
