"""Bildirim kanallarinin ortak arayuzu (PRD §23)."""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

#: Desteklenen olay turleri. Ayarlarda olay filtresi bu degerlerle calisir.
EVENT_TRANSFER_COMPLETED = "transfer.completed"
EVENT_TRANSFER_FAILED = "transfer.failed"
EVENT_DEVICE_PAIRED = "device.paired"
EVENT_DISK_LOW = "disk.low"

KNOWN_EVENTS: tuple[str, ...] = (
    EVENT_TRANSFER_COMPLETED,
    EVENT_TRANSFER_FAILED,
    EVENT_DEVICE_PAIRED,
    EVENT_DISK_LOW,
)


@dataclass(frozen=True, slots=True)
class Notification:
    """Kanallara gonderilen tekil bildirim."""

    event: str
    title: str
    message: str
    data: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())

    def to_dict(self) -> dict[str, Any]:
        return {
            "event": self.event,
            "title": self.title,
            "message": self.message,
            "data": self.data,
            "createdAt": self.created_at,
        }


class Channel(abc.ABC):
    """Tek bir bildirim kanali. `send` ASLA disari hata sizdirmamalidir."""

    #: Kanal kimligi (loglarda ve ayarlarda kullanilir).
    name: str = "channel"

    @abc.abstractmethod
    async def send(self, notification: Notification) -> None:
        """Bildirimi gonderir. Hata durumunda istisna firlatabilir; `Notifier` yakalar."""

    def available(self) -> bool:
        """Kanal fiilen yapilandirilmis/kullanilabilir mi?"""
        return True
