"""Otomatik dosya adlandirma (PRD §32).

Degiskenler: `{date}` `{time}` `{device}` `{folder}` `{original}` `{counter}` `{extension}`
Ornek: `{date}_{original}` -> `2026-08-07_IMG_3847.jpg`
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from ..core.normalize import get_base_name, get_extension
from ..security.paths import sanitize_file_name

_TOKEN = re.compile(r"\{(date|time|device|folder|original|counter|extension)\}", re.IGNORECASE)


def apply_naming_template(
    template: str,
    filename: str,
    *,
    device_name: str = "",
    folder_name: str = "",
    counter: int = 1,
    counter_padding: int = 3,
    now: datetime | None = None,
) -> str:
    """Sablonu uygular. Sablon bos ise orijinal ad (temizlenmis) doner."""
    if not template or not template.strip():
        return sanitize_file_name(filename)

    moment = now or datetime.now(tz=UTC)
    extension = get_extension(filename)
    values = {
        "date": moment.strftime("%Y-%m-%d"),
        "time": moment.strftime("%H-%M-%S"),
        "device": sanitize_file_name(device_name, fallback="cihaz") if device_name else "",
        "folder": sanitize_file_name(folder_name, fallback="hedef") if folder_name else "",
        "original": get_base_name(filename),
        "counter": str(counter).zfill(counter_padding),
        "extension": extension,
    }

    out = _TOKEN.sub(lambda m: values.get(m.group(1).lower(), ""), template)

    # Sablonda {extension} yoksa orijinal uzanti korunur.
    if (
        extension
        and not re.search(r"\{extension\}", template, re.IGNORECASE)
        and not out.lower().endswith(f".{extension}")
    ):
        out = f"{out}.{extension}"

    out = re.sub(r"[_\-. ]{2,}", lambda m: m.group(0)[0], out).strip("_- .")
    result = sanitize_file_name(out)
    return result if result and result != "dosya" else sanitize_file_name(filename)
