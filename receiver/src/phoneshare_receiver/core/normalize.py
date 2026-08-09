"""`packages/shared/src/normalize.ts` Python portu.

Davranis birebir ayni olmalidir; kural motoru paritesi buna dayanir.
"""

from __future__ import annotations

import math
import re
import unicodedata
from datetime import UTC, datetime

# NFKD sonrasi kalan birlestirici aksan isaretleri.
_COMBINING_MARKS = re.compile("[\u0300-\u036f]")

_TR_MAP = {
    "İ": "i",  # I with dot
    "I": "i",
    "ı": "i",  # dotless i
    "Ş": "s",
    "ş": "s",
    "Ğ": "g",
    "ğ": "g",
    "Ü": "u",
    "ü": "u",
    "Ö": "o",
    "ö": "o",
    "Ç": "c",
    "ç": "c",
}

DAY_MS = 24 * 60 * 60 * 1000


def normalize_text(value: str) -> str:
    """Turkce karakterleri ASCII'ye indirger ve kucuk harfe cevirir."""
    out = "".join(_TR_MAP.get(ch, ch) for ch in value)
    out = unicodedata.normalize("NFKD", out.lower())
    return _COMBINING_MARKS.sub("", out)


def _leaf(file_name: str) -> str:
    return re.split(r"[\\/]", file_name)[-1] or file_name


def get_extension(file_name: str) -> str:
    """'report.final.PDF' -> 'pdf'; uzantisiz dosyada '' doner."""
    base = _leaf(file_name)
    idx = base.rfind(".")
    if idx <= 0 or idx == len(base) - 1:
        return ""
    return base[idx + 1 :].lower()


def get_base_name(file_name: str) -> str:
    """'report.final.PDF' -> 'report.final'."""
    base = _leaf(file_name)
    idx = base.rfind(".")
    if idx <= 0:
        return base
    return base[:idx]


_SIZE_UNITS = {
    "b": 1,
    "kb": 1024,
    "mb": 1024**2,
    "gb": 1024**3,
    "tb": 1024**4,
}

_SIZE_RE = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*(b|kb|mb|gb|tb)?\s*$", re.IGNORECASE)


def _js_round(value: float) -> int:
    """JS `Math.round` yarim degerleri yukari (pozitif sonsuza) yuvarlar."""
    return int(math.floor(value + 0.5))


def parse_size(value: str) -> int | None:
    """'10MB', '1.5 gb', '512' (byte) -> byte sayisi. Gecersizse None."""
    if not isinstance(value, str):
        return None
    m = _SIZE_RE.match(value)
    if not m:
        return None
    try:
        num = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    if not math.isfinite(num):
        return None
    unit = (m.group(2) or "b").lower()
    factor = _SIZE_UNITS.get(unit)
    if factor is None:
        return None
    return _js_round(num * factor)


_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_date(value: str | datetime | None) -> int | None:
    """Tarih girdisini UTC epoch milisaniyeye cevirir. Gecersizse None."""
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=UTC)
        return int(dt.timestamp() * 1000)
    trimmed = value.strip()
    if not trimmed:
        return None
    candidate = f"{trimmed}T00:00:00.000Z" if _DATE_ONLY.match(trimmed) else trimmed
    iso = candidate.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return None
    if dt.tzinfo is None:
        # `Date.parse` tarih-saat gostergesini yerel degil UTC kabul edecek sekilde
        # calisir (ISO, zaman dilimsiz) — burada da UTC varsayilir.
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp() * 1000)


def split_list(value: str) -> list[str]:
    """Virgul/noktali virgul ile ayrilmis listeyi bos olmayan parcalara boler."""
    return [p.strip() for p in re.split(r"[,;]", value) if p.strip()]


_GLOB_ESCAPE = re.compile(r"[.+^${}()|\[\]\\]")


def glob_to_regexp(pattern: str) -> re.Pattern[str]:
    """`*` ve `?` destekleyen basit glob -> derlenmis regex (case-insensitive)."""
    escaped = _GLOB_ESCAPE.sub(lambda m: "\\" + m.group(0), pattern)
    body = escaped.replace("*", ".*").replace("?", ".")
    # JS'te `.` yeni satir eslemez ve `$` yalnizca metin sonudur; ayni davranis.
    return re.compile(f"^{body}\\Z", re.IGNORECASE)
