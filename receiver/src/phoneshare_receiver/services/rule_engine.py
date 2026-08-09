"""DB kurallarini kural motoruna (PRD §33/§34) baglayan ince adaptor."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Rule as RuleRow
from ..models import Target as TargetRow
from .rules import FileMeta, Folder, ResolvedTarget, Rule, resolve_target


def _to_folder(row: TargetRow) -> Folder:
    return Folder(id=row.id, name=row.name, path=row.path)


def _to_rule(row: RuleRow) -> Rule:
    return Rule(
        id=row.id,
        name=row.name,
        priority=row.priority,
        enabled=row.enabled,
        match_type=row.match_type,  # type: ignore[arg-type]
        match_value=row.match_value,
        target_folder_id=row.target_id,
        rename=row.rename,
        conflict_policy=row.conflict_policy,  # type: ignore[arg-type]
    )


async def resolve_for_file(
    session: AsyncSession,
    *,
    filename: str,
    size: int,
    mime_type: str | None = None,
    device_name: str | None = None,
    default_target_id: str | None = None,
    default_conflict_policy: str = "rename",
) -> ResolvedTarget:
    """Siralanmis kurallardan ILK eslesen uygulanir; yoksa varsayilana duser."""
    rules = [
        _to_rule(r)
        for r in (
            (await session.execute(select(RuleRow).where(RuleRow.enabled.is_(True))))
            .scalars()
            .all()
        )
    ]
    folders = [
        _to_folder(t)
        for t in (
            (await session.execute(select(TargetRow).where(TargetRow.enabled.is_(True))))
            .scalars()
            .all()
        )
    ]
    meta = FileMeta(
        file_name=filename,
        size_bytes=size,
        source_app=device_name,
        mime_type=mime_type,
    )
    return resolve_target(
        meta,
        rules,
        folders,
        default_folder_id=default_target_id,
        default_conflict_policy=default_conflict_policy,  # type: ignore[arg-type]
    )
