"""Bildirim kanallari: Windows toast, generic webhook, Discord webhook, SMTP mail.

Hepsi opsiyoneldir; yapilandirilmamis kanal `available()` ile kendini eler.
Hicbir kanal transferi etkilemez — hatalar `Notifier` icinde yutulur ve loglanir.
"""

from __future__ import annotations

import asyncio
import importlib.util
import ssl
from email.message import EmailMessage

from ...core.logging_setup import get_logger
from .base import Channel, Notification

log = get_logger("system")

#: Webhook URL'leri yalnizca bu semalarla kabul edilir (file://, gopher:// vb. reddedilir).
ALLOWED_SCHEMES = ("https://", "http://")


def is_valid_webhook_url(url: str | None) -> bool:
    return bool(url) and url.startswith(ALLOWED_SCHEMES)  # type: ignore[union-attr]


class ToastChannel(Channel):
    """Windows masaustu bildirimi. `win10toast` veya `plyer` varsa calisir."""

    name = "toast"

    def __init__(self, enabled: bool = False, timeout_sec: int = 8) -> None:
        self.enabled = enabled
        self.timeout_sec = timeout_sec

    def available(self) -> bool:
        if not self.enabled:
            return False
        return any(
            importlib.util.find_spec(mod) is not None for mod in ("win10toast", "plyer")
        )

    async def send(self, notification: Notification) -> None:
        # Toast API'leri senkron ve blokelidir; ayri thread'de calistirilir.
        await asyncio.to_thread(self._send_sync, notification)

    def _send_sync(self, notification: Notification) -> None:
        if importlib.util.find_spec("win10toast") is not None:
            from win10toast import ToastNotifier  # type: ignore[import-not-found]

            ToastNotifier().show_toast(
                notification.title, notification.message, duration=self.timeout_sec, threaded=True
            )
            return
        from plyer import notification as plyer_notification  # type: ignore[import-not-found]

        plyer_notification.notify(
            title=notification.title, message=notification.message, timeout=self.timeout_sec
        )


class WebhookChannel(Channel):
    """Generic webhook: bildirimin JSON govdesini POST eder."""

    name = "webhook"

    def __init__(self, url: str | None, timeout_sec: float = 10.0) -> None:
        self.url = url
        self.timeout_sec = timeout_sec

    def available(self) -> bool:
        return is_valid_webhook_url(self.url)

    async def send(self, notification: Notification) -> None:
        import httpx

        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.post(str(self.url), json=notification.to_dict())
            response.raise_for_status()


class DiscordChannel(Channel):
    """Discord webhook: `content` alanina duz metin gonderir."""

    name = "discord"

    def __init__(self, url: str | None, timeout_sec: float = 10.0) -> None:
        self.url = url
        self.timeout_sec = timeout_sec

    def available(self) -> bool:
        return is_valid_webhook_url(self.url)

    async def send(self, notification: Notification) -> None:
        import httpx

        # Discord icerik siniri 2000 karakter.
        content = f"**{notification.title}**\n{notification.message}"[:1900]
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.post(str(self.url), json={"content": content})
            response.raise_for_status()


class SmtpChannel(Channel):
    """SMTP mail. Parola ASLA config.json'da tutulmaz; ortam degiskeninden gelir."""

    name = "smtp"

    def __init__(
        self,
        host: str | None,
        port: int = 587,
        user: str | None = None,
        password: str | None = None,
        sender: str | None = None,
        recipients: list[str] | None = None,
        starttls: bool = True,
        timeout_sec: float = 15.0,
    ) -> None:
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.sender = sender or user
        self.recipients = recipients or []
        self.starttls = starttls
        self.timeout_sec = timeout_sec

    def available(self) -> bool:
        return bool(self.host and self.sender and self.recipients)

    async def send(self, notification: Notification) -> None:
        await asyncio.to_thread(self._send_sync, notification)

    def _send_sync(self, notification: Notification) -> None:
        import smtplib

        message = EmailMessage()
        message["Subject"] = f"[PhoneShare] {notification.title}"
        message["From"] = str(self.sender)
        message["To"] = ", ".join(self.recipients)
        message.set_content(f"{notification.message}\n\nOlay: {notification.event}\n")

        if self.port == 465:
            with smtplib.SMTP_SSL(
                str(self.host), self.port, timeout=self.timeout_sec,
                context=ssl.create_default_context(),
            ) as server:
                self._auth_and_send(server, message)
            return

        with smtplib.SMTP(str(self.host), self.port, timeout=self.timeout_sec) as server:
            if self.starttls:
                server.starttls(context=ssl.create_default_context())
            self._auth_and_send(server, message)

    def _auth_and_send(self, server, message: EmailMessage) -> None:
        if self.user and self.password:
            server.login(self.user, self.password)
        server.send_message(message)
