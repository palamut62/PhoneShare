"""Telefondan, izin verilmis hedeflerdeki dosyalara guvenli erisim."""

from __future__ import annotations

import mimetypes
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import NotFoundError, ValidationError
from ...models import Device
from ...security.paths import is_within
from ...services.targets import get_target
from ..deps import current_device_or_loopback, get_session

router = APIRouter(prefix="/files", tags=["files"])


def _resolve_entry(root: Path, relative_path: str, *, expect_directory: bool) -> Path:
    """Goreli yolu hedef kokunun icinde cozer; traversal ve symlink kacisini engeller."""
    normalized = relative_path.replace("\\", "/").strip("/")
    parts = PurePosixPath(normalized).parts if normalized else ()
    if any(part in {"", ".", ".."} for part in parts):
        raise ValidationError("Dosya yolu kullanilamaz.")

    candidate = root.joinpath(*parts)
    if not is_within(candidate, root):
        raise ValidationError("Dosya yolu kullanilamaz.")
    if not candidate.exists():
        raise NotFoundError("Dosya veya klasor bulunamadi.")
    if expect_directory and not candidate.is_dir():
        raise ValidationError("Secilen yol bir klasor degil.")
    if not expect_directory and not candidate.is_file():
        raise ValidationError("Secilen yol bir dosya degil.")
    return candidate


@router.get("")
async def list_files(
    target_id: str | None = Query(default=None, max_length=64),
    path: str = Query(default="", max_length=1024),
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Etkin hedefleri veya secilen hedefin bir klasorundeki girdileri listeler."""
    if target_id is None:
        from ...services.targets import list_targets

        targets = await list_targets(session, only_enabled=True)
        return {
            "target_id": None,
            "path": "",
            "entries": [
                {
                    "name": target.name,
                    "path": "",
                    "kind": "target",
                    "size": None,
                    "modified_at": None,
                    "target_id": target.id,
                }
                for target in targets
            ],
        }

    target = await get_target(session, target_id)
    if not target.enabled:
        raise NotFoundError("Paylasilan klasor bulunamadi.")
    root = Path(target.path).resolve(strict=False)
    directory = _resolve_entry(root, path, expect_directory=True)
    entries: list[dict] = []
    try:
        children = sorted(
            directory.iterdir(), key=lambda item: (not item.is_dir(), item.name.casefold())
        )
    except OSError as exc:
        raise ValidationError("Klasor okunamadi.", detail=str(exc)) from exc

    for child in children[:2000]:
        if child.name.startswith(".") or not is_within(child, root):
            continue
        try:
            stat = child.stat()
        except OSError:
            continue
        relative = child.relative_to(root).as_posix()
        entries.append(
            {
                "name": child.name,
                "path": relative,
                "kind": "folder" if child.is_dir() else "file",
                "size": None if child.is_dir() else stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=UTC).isoformat(),
                "target_id": target.id,
            }
        )
    return {"target_id": target.id, "target_name": target.name, "path": path, "entries": entries}


@router.get("/download")
async def download_file(
    target_id: str = Query(max_length=64),
    path: str = Query(min_length=1, max_length=1024),
    _device: Device | None = Depends(current_device_or_loopback),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    """Etkin hedef icindeki tek bir dosyayi telefona indirir."""
    target = await get_target(session, target_id)
    if not target.enabled:
        raise NotFoundError("Paylasilan klasor bulunamadi.")
    root = Path(target.path).resolve(strict=False)
    file_path = _resolve_entry(root, path, expect_directory=False)
    media_type, _encoding = mimetypes.guess_type(file_path.name)
    return FileResponse(file_path, filename=file_path.name, media_type=media_type)
