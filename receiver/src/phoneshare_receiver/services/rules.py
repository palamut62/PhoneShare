"""`packages/shared/src/rules.ts` Python portu — davranissal olarak birebir ayni.

Control plane (TS) ve agent (Python) ayni girdi icin ayni hedef klasor/dosya adini
uretmek zorundadir; `tests/test_rules_parity.py` bunu rules.test.ts case'leriyle dogrular.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from ..core.normalize import (
    DAY_MS,
    get_base_name,
    get_extension,
    glob_to_regexp,
    normalize_text,
    parse_date,
    parse_size,
    split_list,
)

MatchType = Literal["extension", "filename", "source", "size", "date", "tag"]
ConflictPolicy = Literal["overwrite", "rename", "version", "skip"]

CONFLICT_POLICIES: frozenset[str] = frozenset({"overwrite", "rename", "version", "skip"})


@dataclass(frozen=True, slots=True)
class Folder:
    id: str
    name: str
    path: str
    parent_id: str | None = None
    is_default: bool = False

    @classmethod
    def from_api(cls, data: dict) -> Folder:
        return cls(
            id=str(data["id"]),
            name=str(data.get("name") or ""),
            path=str(data.get("path") or ""),
            parent_id=data.get("parentId"),
            is_default=bool(data.get("isDefault")),
        )


@dataclass(frozen=True, slots=True)
class Rule:
    id: str
    name: str
    priority: int
    enabled: bool
    match_type: MatchType
    match_value: str
    target_folder_id: str
    rename: str | None = None
    conflict_policy: ConflictPolicy = "rename"

    @classmethod
    def from_api(cls, data: dict) -> Rule:
        policy = data.get("conflictPolicy") or "rename"
        return cls(
            id=str(data["id"]),
            name=str(data.get("name") or ""),
            priority=int(data.get("priority") or 0),
            enabled=bool(data.get("enabled", True)),
            match_type=data["matchType"],
            match_value=str(data.get("matchValue") or ""),
            target_folder_id=str(data["targetFolderId"]),
            rename=data.get("rename") or None,
            conflict_policy=policy if policy in CONFLICT_POLICIES else "rename",
        )


@dataclass(frozen=True, slots=True)
class FileMeta:
    file_name: str
    size_bytes: int
    source_app: str | None = None
    mime_type: str | None = None
    created_at: str | datetime | None = None
    tags: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class ResolvedTarget:
    folder_id: str | None
    file_name: str
    conflict_policy: ConflictPolicy
    matched_rule_id: str | None


# ------------------------------------------------------------------ #
# Tekil eslesticiler                                                  #
# ------------------------------------------------------------------ #


def _match_extension(file: FileMeta, value: str) -> bool:
    ext = get_extension(file.file_name)
    if not ext:
        return False
    file_name = re.split(r"[\\/]", file.file_name)[-1] or file.file_name
    for raw in split_list(value):
        pattern = raw.strip()
        if not pattern:
            continue
        if "*" in pattern or "?" in pattern:
            if glob_to_regexp(pattern).search(file_name):
                return True
            continue
        if re.sub(r"^\.", "", pattern).lower() == ext:
            return True
    return False


def _match_filename(file: FileMeta, value: str) -> bool:
    haystack = normalize_text(file.file_name)
    for raw in split_list(value):
        needle = normalize_text(raw)
        if not needle:
            continue
        if "*" in needle or "?" in needle:
            if glob_to_regexp(needle).search(haystack):
                return True
            continue
        if needle in haystack:
            return True
    return False


def _match_source(file: FileMeta, value: str) -> bool:
    if not file.source_app:
        return False
    haystack = normalize_text(file.source_app)
    return any(
        needle and needle in haystack for needle in (normalize_text(r) for r in split_list(value))
    )


_RANGE_RE = re.compile(r"^([^-]+)-(.+)$")
_SIZE_OP_RE = re.compile(r"^(>=|<=|>|<|=)?\s*(.+)$", re.DOTALL)


def _match_size(file: FileMeta, value: str) -> bool:
    raw = value.strip()
    range_m = _RANGE_RE.match(raw)
    if range_m and not re.match(r"^[<>=]", raw):
        low = parse_size(range_m.group(1))
        high = parse_size(range_m.group(2))
        if low is None or high is None:
            return False
        return low <= file.size_bytes <= high

    m = _SIZE_OP_RE.match(raw)
    if not m:
        return False
    op = m.group(1) or "="
    size_bytes = parse_size(m.group(2))
    if size_bytes is None:
        return False
    if op == ">":
        return file.size_bytes > size_bytes
    if op == ">=":
        return file.size_bytes >= size_bytes
    if op == "<":
        return file.size_bytes < size_bytes
    if op == "<=":
        return file.size_bytes <= size_bytes
    return file.size_bytes == size_bytes


_DATE_OP_RE = re.compile(r"^(>=|<=|>|<)\s*(.+)$", re.DOTALL)


def _match_date(file: FileMeta, value: str) -> bool:
    at = parse_date(file.created_at)
    if at is None:
        return False
    raw = value.strip()

    parts = raw.split("..")
    if len(parts) == 2:
        start = parse_date(parts[0].strip())
        end = parse_date(parts[1].strip())
        if start is None or end is None:
            return False
        # Bitis gunu dahil olsun diye gun sonuna tasinir.
        return start <= at <= end + DAY_MS - 1

    m = _DATE_OP_RE.match(raw)
    if m:
        bound = parse_date(m.group(2).strip())
        if bound is None:
            return False
        op = m.group(1)
        if op == ">":
            return at > bound
        if op == ">=":
            return at >= bound
        if op == "<":
            return at < bound
        return at <= bound + DAY_MS - 1

    day = parse_date(raw)
    if day is None:
        return False
    return day <= at < day + DAY_MS


def _match_tag(file: FileMeta, value: str) -> bool:
    tags = [normalize_text(t) for t in (file.tags or ())]
    if not tags:
        return False
    return any(normalize_text(raw) in tags for raw in split_list(value))


# ------------------------------------------------------------------ #
# Genel API                                                           #
# ------------------------------------------------------------------ #

_MATCHERS = {
    "extension": _match_extension,
    "filename": _match_filename,
    "source": _match_source,
    "size": _match_size,
    "date": _match_date,
    "tag": _match_tag,
}


def match_rule(file: FileMeta, rule: Rule) -> bool:
    """Tek bir kuralin dosyaya uyup uymadigini soyler. Devre disi kural asla eslesmez."""
    if not rule.enabled:
        return False
    if not rule.match_value or not rule.match_value.strip():
        return False
    matcher = _MATCHERS.get(rule.match_type)
    if matcher is None:
        return False
    return matcher(file, rule.match_value)


_UNSAFE_SEGMENT = re.compile('[\\/:*?"<>|\x00-\x1f]')


def sanitize_segment(value: str) -> str:
    """Dosya sistemi icin guvenli olmayan karakterleri temizler."""
    out = _UNSAFE_SEGMENT.sub("_", value)
    out = re.sub(r"\s+", " ", out).strip()
    return re.sub(r"[. ]+$", "", out)


def apply_rename_template(
    template: str,
    file: FileMeta,
    seq: int = 1,
    seq_padding: int = 3,
) -> str:
    """Sablon: {date} {source} {orig} {ext} {seq}.

    Ornek: "{date}_{source}_{orig}.{ext}" -> "2024-05-03_whatsapp_fatura.pdf"
    """
    at = parse_date(file.created_at)
    if at is None:
        at = int(datetime.now(tz=UTC).timestamp() * 1000)
    d = datetime.fromtimestamp(at / 1000, tz=UTC)
    values = {
        "date": f"{d.year:04d}-{d.month:02d}-{d.day:02d}",
        "source": normalize_text(file.source_app) if file.source_app else "unknown",
        "orig": get_base_name(file.file_name),
        "ext": get_extension(file.file_name),
        "seq": str(seq).zfill(seq_padding),
    }

    out = re.sub(
        r"\{(date|source|orig|ext|seq)\}",
        lambda m: values.get(m.group(1).lower(), ""),
        template,
        flags=re.IGNORECASE,
    )

    ext = values["ext"]
    # Sablonda {ext} yoksa orijinal uzantiyi koru.
    if (
        ext
        and not re.search(r"\{ext\}", template, re.IGNORECASE)
        and not out.lower().endswith(f".{ext}")
    ):
        out = f"{out}.{ext}"
    # Uzanti bos kaldiysa olusan sondaki noktayi temizle.
    out = re.sub(r"\.+$", "", out)

    sanitized = sanitize_segment(out)
    return sanitized if sanitized else file.file_name


def sort_rules(rules: list[Rule]) -> list[Rule]:
    """Oncelik (kucuk once), esitlikte id ile deterministik siralama."""
    return sorted(rules, key=lambda r: (r.priority, r.id))


def resolve_target(
    file: FileMeta,
    rules: list[Rule],
    folders: list[Folder],
    default_folder_id: str | None = None,
    default_conflict_policy: ConflictPolicy = "rename",
    seq: int = 1,
    seq_padding: int = 3,
) -> ResolvedTarget:
    """Oncelik sirasina gore ILK eslesen kural kazanir; yoksa varsayilan klasore duser."""
    folder_ids = {f.id for f in folders}

    for rule in sort_rules(rules):
        if not match_rule(file, rule):
            continue
        # Hedef klasor silinmisse kural gecersiz sayilir, sonraki kurala bakilir.
        if folders and rule.target_folder_id not in folder_ids:
            continue
        return ResolvedTarget(
            folder_id=rule.target_folder_id,
            file_name=(
                apply_rename_template(rule.rename, file, seq=seq, seq_padding=seq_padding)
                if rule.rename
                else file.file_name
            ),
            conflict_policy=rule.conflict_policy,
            matched_rule_id=rule.id,
        )

    fallback = default_folder_id
    if fallback is None:
        fallback = next((f.id for f in folders if f.is_default), None)
    if fallback is None:
        fallback = next((f.id for f in folders if f.parent_id is None), None)

    return ResolvedTarget(
        folder_id=fallback,
        file_name=file.file_name,
        conflict_policy=default_conflict_policy,
        matched_rule_id=None,
    )
