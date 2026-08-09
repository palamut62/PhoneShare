"""WebSocket yayin merkezi (PRD §46): PC durumu, transfer ilerlemesi, cihaz olaylari (`/api/ws`)."""

from __future__ import annotations

import asyncio
from typing import Any

from ..core.logging_setup import get_logger

log = get_logger("api")


class ProgressHub:
    """Bagli istemcilere olay yayinlar. Yavas istemci digerlerini bloklamaz."""

    def __init__(self) -> None:
        self._clients: set[Any] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any) -> None:
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect(self, websocket: Any) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, event: str, data: dict[str, Any]) -> None:
        payload = {"event": event, "data": data}
        async with self._lock:
            targets = list(self._clients)
        dead: list[Any] = []
        for client in targets:
            try:
                await client.send_json(payload)
            except Exception:
                dead.append(client)
        if dead:
            async with self._lock:
                for client in dead:
                    self._clients.discard(client)
