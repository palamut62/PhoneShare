"""Denetim kaydi (PRD §65).

PRD §66: token, parola, tam Authorization basligi ve gizli anahtarlar loglanmaz.
`record_audit` gelen detay sozlugunu once temizler.
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..core.logging_setup import get_logger
from ..models import AuditLog

DEVICE_PAIRED = "DEVICE_PAIRED"
DEVICE_REMOVED = "DEVICE_REMOVED"
UPLOAD_STARTED = "UPLOAD_STARTED"
UPLOAD_COMPLETED = "UPLOAD_COMPLETED"
UPLOAD_FAILED = "UPLOAD_FAILED"
TARGET_CREATED = "TARGET_CREATED"
TARGET_CHANGED = "TARGET_CHANGED"
RULE_CREATED = "RULE_CREATED"
RULE_CHANGED = "RULE_CHANGED"
RULE_REMOVED = "RULE_REMOVED"
SETTINGS_CHANGED = "SETTINGS_CHANGED"
AUTH_FAILED = "AUTH_FAILED"

EVENTS = frozenset(
    {
        DEVICE_PAIRED,
        DEVICE_REMOVED,
        UPLOAD_STARTED,
        UPLOAD_COMPLETED,
        UPLOAD_FAILED,
        TARGET_CREATED,
        TARGET_CHANGED,
        RULE_CREATED,
        RULE_CHANGED,
        RULE_REMOVED,
        SETTINGS_CHANGED,
        AUTH_FAILED,
    }
)

_SENSITIVE_KEY = re.compile(
    r"(token|secret|password|passwd|authorization|auth|apikey|api_key|code)", re.IGNORECASE
)

_log = get_logger("auth")


def redact(detail: Any) -> Any:
    """Hassas anahtarlari `[redacted]` ile degistirir (ic ice sozluk/liste dahil)."""
    if isinstance(detail, dict):
        return {
            k: ("[redacted]" if _SENSITIVE_KEY.search(str(k)) else redact(v))
            for k, v in detail.items()
        }
    if isinstance(detail, list):
        return [redact(v) for v in detail]
    return detail


async def record_audit(
    session: AsyncSession,
    event: str,
    *,
    device_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Denetim kaydini olusturur (commit cagiranin sorumlulugundadir)."""
    if event not in EVENTS:
        raise ValueError(f"Bilinmeyen denetim olayi: {event}")
    safe = redact(detail or {})
    entry = AuditLog(
        event=event,
        device_id=device_id,
        detail=json.dumps(safe, ensure_ascii=False) if safe else None,
    )
    session.add(entry)
    _log.info("audit", extra={"category": "auth", "event": event, "device_id": device_id})
    return entry
