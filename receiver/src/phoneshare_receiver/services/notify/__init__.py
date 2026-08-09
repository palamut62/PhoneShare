"""Bildirimler (PRD §23) — OPSIYONEL, varsayilan KAPALI.

`notify_enabled=false` iken `Notifier.notify()` hicbir sey yapmaz; hicbir ag
istegi cikmaz. Acikken bile kanal hatalari YUTULUR ve yalnizca loglanir:
bildirim gonderilemedi diye bir transfer asla basarisiz olmaz.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from ...core.config import AgentConfig
from ...core.logging_setup import get_logger
from .base import (
    EVENT_DEVICE_PAIRED,
    EVENT_DISK_LOW,
    EVENT_TRANSFER_COMPLETED,
    EVENT_TRANSFER_FAILED,
    KNOWN_EVENTS,
    Channel,
    Notification,
)
from .channels import (
    DiscordChannel,
    SmtpChannel,
    ToastChannel,
    WebhookChannel,
    is_valid_webhook_url,
)

log = get_logger("system")

#: SMTP parolasi config.json'da DEGIL, bu ortam degiskeninde tutulur.
SMTP_PASSWORD_ENV = "PHONESHARE_SMTP_PASSWORD"

__all__ = [
    "EVENT_DEVICE_PAIRED",
    "EVENT_DISK_LOW",
    "EVENT_TRANSFER_COMPLETED",
    "EVENT_TRANSFER_FAILED",
    "KNOWN_EVENTS",
    "SMTP_PASSWORD_ENV",
    "Channel",
    "DiscordChannel",
    "Notification",
    "Notifier",
    "SmtpChannel",
    "ToastChannel",
    "WebhookChannel",
    "build_notifier",
    "is_valid_webhook_url",
]


class Notifier:
    """Kanallari bir arada yoneten cephe. Hata izolasyonu burada."""

    def __init__(
        self,
        channels: list[Channel] | None = None,
        events: list[str] | None = None,
        enabled: bool = False,
    ) -> None:
        self.enabled = enabled
        # Bos liste = TUM olaylar gecerlidir.
        self.events = [e for e in (events or []) if e]
        self._channels = channels or []

    @property
    def channels(self) -> list[Channel]:
        """Yalnizca fiilen kullanilabilir (yapilandirilmis) kanallar."""
        return [c for c in self._channels if c.available()]

    def should_send(self, event: str) -> bool:
        if not self.enabled:
            return False
        if not self.events:
            return True
        return event in self.events

    async def notify(
        self,
        event: str,
        title: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> int:
        """Bildirimi uygun kanallara gonderir; BASARILI kanal sayisini dondurur."""
        if not self.should_send(event):
            return 0
        channels = self.channels
        if not channels:
            return 0

        notification = Notification(event=event, title=title, message=message, data=data or {})
        results = await asyncio.gather(
            *(channel.send(notification) for channel in channels),
            return_exceptions=True,
        )

        sent = 0
        for channel, result in zip(channels, results, strict=True):
            if isinstance(result, BaseException):
                # Bir kanalin hatasi digerlerini ve transferi ETKILEMEZ.
                log.warning(
                    "Bildirim kanali basarisiz",
                    extra={"category": "system", "channel": channel.name, "error": str(result)},
                )
                continue
            sent += 1
        return sent


def build_notifier(config: AgentConfig) -> Notifier:
    """Yapilandirmadan bildirim kanallarini kurar. Kapaliysa bos bir Notifier doner."""
    if not config.notify_enabled:
        return Notifier(enabled=False)

    for url in (config.notify_webhook_url, config.notify_discord_webhook_url):
        if url and not is_valid_webhook_url(url):
            log.warning(
                "Gecersiz webhook URL'i yok sayildi (http/https bekleniyor)",
                extra={"category": "system"},
            )

    channels: list[Channel] = [
        ToastChannel(enabled=config.notify_toast_enabled),
        WebhookChannel(config.notify_webhook_url),
        DiscordChannel(config.notify_discord_webhook_url),
        SmtpChannel(
            host=config.notify_smtp_host,
            port=config.notify_smtp_port,
            user=config.notify_smtp_user,
            password=os.environ.get(SMTP_PASSWORD_ENV) or None,
            sender=config.notify_smtp_from,
            recipients=list(config.notify_smtp_to),
            starttls=config.notify_smtp_starttls,
        ),
    ]
    return Notifier(channels=channels, events=list(config.notify_events), enabled=True)
