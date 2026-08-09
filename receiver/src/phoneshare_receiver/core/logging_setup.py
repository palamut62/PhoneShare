"""PRD §31 loglama: JSON formatli, kategorili, donen dosya handler'i.

Kategoriler: transfer / api / auth / system / error / performance.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
from datetime import UTC, datetime
from typing import Any

from .config import logs_dir

CATEGORIES = ("transfer", "api", "auth", "system", "error", "performance")

_RESERVED = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
    "taskName",
}


class JsonFormatter(logging.Formatter):
    """Tek satirlik JSON kayit; ek alanlar `extra=` ile tasinir."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "category": getattr(record, "category", "system"),
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_") or key == "category":
                continue
            try:
                json.dumps(value)
            except (TypeError, ValueError):
                value = repr(value)
            payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


_configured = False


def setup_logging(level: str = "INFO", to_file: bool = True) -> None:
    """Kok logger'i JSON formatina baglar (idempotent)."""
    global _configured
    if _configured:
        return

    root = logging.getLogger("phoneshare")
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    root.propagate = False

    stream = logging.StreamHandler()
    stream.setFormatter(JsonFormatter())
    root.addHandler(stream)

    if to_file:
        try:
            directory = logs_dir()
            directory.mkdir(parents=True, exist_ok=True)
            handler = logging.handlers.RotatingFileHandler(
                directory / "agent.log",
                maxBytes=10 * 1024 * 1024,
                backupCount=10,
                encoding="utf-8",
            )
            handler.setFormatter(JsonFormatter())
            root.addHandler(handler)
        except OSError:
            # Log dosyasi acilamazsa servis yine de calismali.
            root.warning("Log dosyasi acilamadi", extra={"category": "error"})

    _configured = True


class CategoryAdapter(logging.LoggerAdapter):
    """Varsayilan kategoriyi ekler ama cagri sirasindaki `extra` alanlarini korur.

    Standart `LoggerAdapter` cagri `extra`sini tamamen ezerdi; burada birlestirilir,
    boylece `extra={"category": "error", "uploadId": ...}` beklendigi gibi calisir.
    """

    def process(self, msg: Any, kwargs: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        merged = dict(self.extra or {})
        merged.update(kwargs.get("extra") or {})
        if merged.get("category") not in CATEGORIES:
            merged["category"] = "system"
        kwargs["extra"] = merged
        return msg, kwargs


def get_logger(category: str = "system") -> CategoryAdapter:
    """Kategori varsayilani sabitlenmis logger adaptoru dondurur."""
    if category not in CATEGORIES:
        category = "system"
    return CategoryAdapter(logging.getLogger(f"phoneshare.{category}"), {"category": category})
