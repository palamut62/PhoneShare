"""Sanal hedef yonetimi (PRD §20/§35/§36/§63).

Backend dosya sisteminin TEK otoritesidir (PRD §93): PWA yalnizca `target_id` gonderir,
gercek Windows yolu API yanitlarinda yer almaz.
"""

from __future__ import annotations

import re
import secrets
import unicodedata
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import ReceiverConfig
from ..core.errors import NotFoundError, ValidationError
from ..models import Target
from ..security import audit
from ..security.paths import UnsafePathError, resolve_within_roots

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value.lower()).encode("ascii", "ignore").decode()
    slug = _SLUG_STRIP.sub("-", ascii_value).strip("-")
    return slug[:48] or secrets.token_hex(4)


def effective_roots(config: ReceiverConfig) -> list[Path]:
    """Yazma izni verilen kok klasorler; hicbiri yoksa ana klasor kullanilir."""
    roots = config.normalized_roots()
    if roots:
        return roots
    if config.base_folder:
        return [Path(config.base_folder).resolve(strict=False)]
    return []


async def list_targets(session: AsyncSession, *, only_enabled: bool = False) -> list[Target]:
    stmt = select(Target).order_by(Target.favorite.desc(), Target.name.asc())
    if only_enabled:
        stmt = stmt.where(Target.enabled.is_(True))
    return list((await session.execute(stmt)).scalars().all())


async def get_target(session: AsyncSession, target_id: str) -> Target:
    target = await session.get(Target, target_id)
    if target is None:
        raise NotFoundError("Hedef bulunamadi.")
    return target


async def _unique_id(session: AsyncSession, name: str) -> str:
    base = slugify(name)
    candidate = base
    for _ in range(50):
        if await session.get(Target, candidate) is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(2)}"
    raise ValidationError("Hedef kimligi uretilemedi.")


def _validate_path(config: ReceiverConfig, raw_path: str) -> str:
    roots = effective_roots(config)
    if not roots:
        raise ValidationError("Once ana klasor secilmelidir.")
    try:
        resolved = resolve_within_roots(raw_path, roots)
    except UnsafePathError as exc:
        raise ValidationError("Secilen klasor kullanilamaz.", detail=str(exc)) from exc
    return str(resolved)


async def create_target(
    session: AsyncSession,
    config: ReceiverConfig,
    *,
    name: str,
    path: str,
    icon: str | None = None,
    favorite: bool = False,
    enabled: bool = True,
) -> Target:
    resolved = _validate_path(config, path)
    target = Target(
        id=await _unique_id(session, name),
        name=name.strip(),
        path=resolved,
        icon=icon,
        favorite=favorite,
        enabled=enabled,
    )
    session.add(target)
    Path(resolved).mkdir(parents=True, exist_ok=True)
    await session.flush()
    await audit.record_audit(session, audit.TARGET_CREATED, detail={"target_id": target.id})
    return target


async def update_target(
    session: AsyncSession,
    config: ReceiverConfig,
    target_id: str,
    *,
    name: str | None = None,
    path: str | None = None,
    icon: str | None = None,
    favorite: bool | None = None,
    enabled: bool | None = None,
) -> Target:
    target = await get_target(session, target_id)
    if name is not None:
        target.name = name.strip()
    if path is not None:
        target.path = _validate_path(config, path)
        Path(target.path).mkdir(parents=True, exist_ok=True)
    if icon is not None:
        target.icon = icon
    if favorite is not None:
        target.favorite = favorite
    if enabled is not None:
        target.enabled = enabled
    await session.flush()
    await audit.record_audit(session, audit.TARGET_CHANGED, detail={"target_id": target.id})
    return target


async def delete_target(session: AsyncSession, target_id: str) -> None:
    """Hedef kaydini siler. Diskteki klasore ve dosyalara DOKUNULMAZ."""
    target = await get_target(session, target_id)
    await session.delete(target)
    await session.flush()
    await audit.record_audit(session, audit.TARGET_CHANGED, detail={"target_id": target_id})


async def resolve_target_dir(
    session: AsyncSession,
    config: ReceiverConfig,
    target_id: str | None,
) -> tuple[Target | None, Path]:
    """`target_id` -> gercek klasor. Yol her zaman allow-list altinda dogrulanir (PRD §50)."""
    roots = effective_roots(config)
    if not roots:
        raise ValidationError("Once ana klasor secilmelidir.")

    if target_id:
        target = await get_target(session, target_id)
        if not target.enabled:
            raise ValidationError("Hedef klasor devre disi.")
        try:
            return target, resolve_within_roots(target.path, roots)
        except UnsafePathError as exc:
            raise ValidationError("Hedef klasor kullanilamaz.", detail=str(exc)) from exc

    fallback = config.base_folder or str(roots[0])
    try:
        return None, resolve_within_roots(fallback, roots)
    except UnsafePathError as exc:
        raise ValidationError("Varsayilan klasor kullanilamaz.", detail=str(exc)) from exc
