"""Kayitli masaustu uygulamalari — uzaktan baslatici.

Guvenlik omurgasi: PWA yalnizca kayitli bir `id` gonderir; gercek exe yolu yalnizca
PC'deki veritabaninda durur ve API yanitlarinda ASLA yer almaz (PRD §93 ile ayni prensip).
"""

from __future__ import annotations

import os
import secrets
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import ReceiverConfig
from ..core.errors import ForbiddenError, NotFoundError, ValidationError
from ..models import App
from ..security import audit
from .targets import slugify


async def list_apps(session: AsyncSession, *, only_enabled: bool = False) -> list[App]:
    stmt = select(App).order_by(App.name.asc())
    if only_enabled:
        stmt = stmt.where(App.enabled.is_(True))
    return list((await session.execute(stmt)).scalars().all())


async def get_app(session: AsyncSession, app_id: str) -> App:
    app = await session.get(App, app_id)
    if app is None:
        raise NotFoundError("Uygulama bulunamadi.")
    return app


async def _unique_id(session: AsyncSession, name: str) -> str:
    base = slugify(name)
    candidate = base
    for _ in range(50):
        if await session.get(App, candidate) is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(2)}"
    raise ValidationError("Uygulama kimligi uretilemedi.")


def _validate_exe_path(exe_path: str) -> str:
    path = Path(exe_path)
    if not path.is_absolute():
        raise ValidationError("Uygulama yolu mutlak (tam) bir yol olmalidir.")
    if not path.is_file():
        raise ValidationError("Belirtilen dosya bulunamadi.")
    if path.suffix.lower() not in (".exe", ".lnk"):
        raise ValidationError("Yalnizca .exe veya .lnk (kisayol) dosyalari kaydedilebilir.")
    return str(path)


async def create_app(
    session: AsyncSession,
    *,
    name: str,
    exe_path: str,
    args: str | None = None,
) -> App:
    clean_name = name.strip()
    if not clean_name:
        raise ValidationError("Uygulama adi bos olamaz.")
    if len(clean_name) > 128:
        raise ValidationError("Uygulama adi cok uzun.")
    resolved = _validate_exe_path(exe_path)
    if Path(resolved).suffix.lower() == ".lnk" and args and args.strip():
        raise ValidationError("Kisayollara ek arguman verilemez.")
    app = App(
        id=await _unique_id(session, clean_name),
        name=clean_name,
        exe_path=resolved,
        args=args,
        enabled=True,
    )
    session.add(app)
    await session.flush()
    await audit.record_audit(session, audit.APP_CREATED, detail={"app_id": app.id})
    return app


async def delete_app(session: AsyncSession, app_id: str) -> None:
    app = await get_app(session, app_id)
    await session.delete(app)
    await session.flush()
    await audit.record_audit(session, audit.APP_REMOVED, detail={"app_id": app_id})


async def launch_app(session: AsyncSession, config: ReceiverConfig, app_id: str) -> App:
    if not config.remote_launch_enabled:
        raise ForbiddenError(
            "Uzaktan uygulama baslatma kapali. Bilgisayarin kendi PhoneShare panelinden acilabilir."
        )
    app = await get_app(session, app_id)
    if not app.enabled:
        raise ValidationError("Uygulama devre disi.")
    exe = Path(app.exe_path)
    if not exe.is_file():
        raise NotFoundError("Uygulama dosyasi bulunamadi.")

    if exe.suffix.lower() == ".lnk":
        if not hasattr(os, "startfile"):
            raise ValidationError("Kisayol baslatma yalnizca Windows'ta desteklenir.")
        os.startfile(str(exe))  # noqa: S606 - kayitli, kullanici tarafindan onaylanan kisayol
    else:
        cmd = [str(exe)] + (app.args.split() if app.args else [])
        popen_kwargs: dict = {
            "shell": False,
            "cwd": str(exe.parent),
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        detached = getattr(subprocess, "DETACHED_PROCESS", None)
        if detached is not None:
            popen_kwargs["creationflags"] = detached
        subprocess.Popen(cmd, **popen_kwargs)

    app.last_launched_at = datetime.now(tz=UTC)
    await session.flush()
    await audit.record_audit(session, audit.APP_LAUNCHED, detail={"app_id": app.id})
    return app
