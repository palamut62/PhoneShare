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
        # Soket -> cihaz id eslemesi; yalnizca token ile baglanan cihazlar icin doludur.
        self._devices: dict[Any, str] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: Any, device_id: str | None = None) -> None:
        async with self._lock:
            self._clients.add(websocket)
            if device_id:
                self._devices[websocket] = device_id

    async def disconnect(self, websocket: Any) -> None:
        async with self._lock:
            self._clients.discard(websocket)
            self._devices.pop(websocket, None)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def online_device_ids(self) -> frozenset[str]:
        """Su an WebSocket ile bagli cihazlarin id kumesi (PRD §46)."""
        return frozenset(self._devices.values())

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
                    self._devices.pop(client, None)
