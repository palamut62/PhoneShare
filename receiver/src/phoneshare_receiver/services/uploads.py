"""Chunk upload akisi (PRD §27-§32, §52, §53, §58-§60).

Akis:
  init  -> Upload + Transfer kaydi, disk/boyut kontrolu, `existing_chunks` (resume)
  chunk -> `.temp/<upload_id>/<index>.part` (idempotent, hash dogrulamali)
  complete -> birlestir -> SHA-256 hesapla -> istemci hash'i ile KARSILASTIR
              -> uyusmazsa FAILED + temizlik
              -> uyusursa cakisma politikasi + atomik tasima -> COMPLETED/VERIFIED
"""

from __future__ import annotations

import asyncio
import math
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import MAX_CHUNK_INDEX, ReceiverConfig
from ..core.errors import (
    ChecksumError,
    ConflictError,
    InsufficientStorageError,
    NotFoundError,
    TooLargeError,
    ValidationError,
)
from ..core.logging_setup import get_logger
from ..models import Device, Transfer, Upload, UploadChunk
from ..security import audit
from ..security.paths import sanitize_file_name
from ..storage.files import DiskQuotaError, atomic_move, ensure_capacity, plan_placement
from ..storage.temp import TempStore, sha256_of
from . import rule_engine, targets
from .naming import apply_naming_template

log = get_logger("transfer")

ACTIVE_STATUSES = ("PREPARING", "UPLOADING")

#: Tamamlama adimini (yerlesim karari + tasima) serilestirir; aksi halde iki
#: eszamanli transfer ayni hedef ada talip olup cakisma politikasini atlayabilir.
_completion_lock = asyncio.Lock()


@dataclass(frozen=True, slots=True)
class InitResult:
    upload: Upload
    existing_chunks: list[int]


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


# --------------------------------------------------------------------- #
# init                                                                   #
# --------------------------------------------------------------------- #


async def init_upload(
    session: AsyncSession,
    config: ReceiverConfig,
    temp_store: TempStore,
    device: Device,
    *,
    filename: str,
    size: int,
    mime_type: str | None,
    target_id: str | None,
    sha256: str | None,
) -> InitResult:
    """Upload oturumu acar veya mevcut olani devam ettirir (PRD §28 resume)."""
    safe_name = sanitize_file_name(filename)
    if not safe_name:
        raise ValidationError("Dosya adi gecersiz.")

    # --- PRD §52: boyut limitleri ---
    if size <= 0:
        raise ValidationError("Dosya boyutu gecersiz.")
    if size > config.max_file_bytes:
        raise TooLargeError(
            "Dosya cok buyuk. Bu bilgisayarin tek dosya siniri asildi.",
            detail=f"size={size} limit={config.max_file_bytes}",
        )

    # --- hedefi belirle (acikca verilmediyse kural motoru karar verir) ---
    resolved_target_id = target_id
    if resolved_target_id is None:
        resolved = await rule_engine.resolve_for_file(
            session,
            filename=safe_name,
            size=size,
            mime_type=mime_type,
            device_name=device.name,
            default_conflict_policy=config.conflict_policy,
        )
        resolved_target_id = resolved.folder_id

    target_row, target_dir = await targets.resolve_target_dir(session, config, resolved_target_id)

    # --- PRD §28: ayni dosya icin devam eden upload var mi? ---
    # Hedef klasor de eslesmeli; aksi halde kullanici farkli hedef secince
    # sessizce eski hedefe devam edilir.
    target_cond = (
        Upload.target_id.is_(resolved_target_id)
        if resolved_target_id is None
        else Upload.target_id == resolved_target_id
    )
    existing = (
        await session.execute(
            select(Upload)
            .where(
                Upload.device_id == device.id,
                Upload.filename == safe_name,
                Upload.size == size,
                Upload.sha256 == sha256,
                target_cond,
                Upload.status.in_(ACTIVE_STATUSES),
            )
            .order_by(Upload.created_at.desc())
        )
    ).scalars().first()

    if existing is not None:
        chunks = await _received_indexes(session, existing.id)
        # Diskte olmayan chunk kayitlarini temizle (yarim kalmis temizlik sonrasi).
        alive = [i for i in chunks if temp_store.has_chunk(existing.id, i)]
        if len(alive) != len(chunks):
            await _prune_chunks(session, existing.id, alive)
            existing.received_bytes = await _received_bytes(session, existing.id)
        await session.flush()
        return InitResult(upload=existing, existing_chunks=sorted(alive))

    # --- PRD §52: toplam transfer siniri (devam eden upload'larin toplami) ---
    in_flight = (
        await session.execute(
            select(func.coalesce(func.sum(Upload.size), 0)).where(
                Upload.device_id == device.id, Upload.status.in_(ACTIVE_STATUSES)
            )
        )
    ).scalar_one()
    if int(in_flight) + size > config.max_total_transfer_bytes:
        raise TooLargeError(
            "Toplam transfer siniri asildi. Once mevcut aktarimlarin bitmesini bekleyin.",
            detail=f"in_flight={in_flight} size={size} limit={config.max_total_transfer_bytes}",
        )

    # --- PRD §53: disk alani kontrolu (teknik detay kullaniciya SIZMAZ, PRD §71) ---
    try:
        ensure_capacity(target_dir, size, config.disk_quota_bytes)
    except DiskQuotaError as exc:
        raise InsufficientStorageError(detail=str(exc)) from exc

    chunk_size = config.chunk_size
    total_chunks = max(1, math.ceil(size / chunk_size))
    if total_chunks > MAX_CHUNK_INDEX:
        raise TooLargeError("Dosya cok fazla parcaya bolunuyor.")

    upload_id = secrets.token_hex(16)
    transfer = Transfer(
        id=secrets.token_hex(16),
        device_id=device.id,
        target_id=target_row.id if target_row else None,
        original_filename=safe_name,
        size=size,
        mime_type=mime_type,
        sha256=sha256,
        status="PREPARING",
        started_at=_now(),
    )
    upload = Upload(
        id=upload_id,
        device_id=device.id,
        target_id=target_row.id if target_row else None,
        transfer_id=transfer.id,
        filename=safe_name,
        size=size,
        mime_type=mime_type,
        sha256=sha256,
        chunk_size=chunk_size,
        total_chunks=total_chunks,
        status="PREPARING",
    )
    session.add(transfer)
    session.add(upload)
    temp_store.ensure(upload_id)
    await session.flush()
    await audit.record_audit(
        session,
        audit.UPLOAD_STARTED,
        device_id=device.id,
        detail={"upload_id": upload_id, "filename": safe_name, "size": size},
    )
    return InitResult(upload=upload, existing_chunks=[])


# --------------------------------------------------------------------- #
# chunk                                                                  #
# --------------------------------------------------------------------- #


async def get_upload(session: AsyncSession, upload_id: str, device: Device) -> Upload:
    upload = await session.get(Upload, upload_id)
    if upload is None or upload.device_id != device.id:
        raise NotFoundError("Aktarim bulunamadi.")
    return upload


async def save_chunk(
    session: AsyncSession,
    temp_store: TempStore,
    device: Device,
    upload_id: str,
    *,
    chunk_index: int,
    chunk_hash: str | None,
    data: bytes,
) -> Upload:
    """Tek chunk'i kaydeder. Ayni chunk tekrar gelirse (resume) idempotenttir."""
    upload = await get_upload(session, upload_id, device)
    if upload.status not in ACTIVE_STATUSES:
        raise ConflictError("Bu aktarim artik parca kabul etmiyor.")

    if chunk_index < 0 or chunk_index >= upload.total_chunks:
        raise ValidationError("Parca sirasi gecersiz.")

    expected = upload.chunk_size
    if chunk_index == upload.total_chunks - 1:
        expected = upload.size - upload.chunk_size * chunk_index
    if len(data) != expected:
        raise ValidationError("Parca boyutu beklenenle uyusmuyor.")

    if chunk_hash:
        normalized = chunk_hash.strip().lower()
        if len(normalized) != 64 or any(c not in "0123456789abcdef" for c in normalized):
            raise ValidationError("Parca dogrulama degeri gecersiz.")
        if sha256_of(data) != normalized:
            raise ChecksumError("Parca dogrulanamadi, lutfen tekrar gonderin.")

    temp_store.write_chunk(upload_id, chunk_index, data)

    row = await session.get(UploadChunk, {"upload_id": upload_id, "chunk_index": chunk_index})
    if row is None:
        session.add(
            UploadChunk(
                upload_id=upload_id,
                chunk_index=chunk_index,
                size=len(data),
                chunk_hash=chunk_hash.lower() if chunk_hash else None,
            )
        )
    else:
        row.size = len(data)
        row.chunk_hash = chunk_hash.lower() if chunk_hash else None

    await session.flush()
    upload.received_bytes = await _received_bytes(session, upload_id)
    upload.status = "UPLOADING"
    if upload.transfer_id:
        transfer = await session.get(Transfer, upload.transfer_id)
        if transfer is not None and transfer.status in ("QUEUED", "PREPARING"):
            transfer.status = "UPLOADING"
    await session.flush()
    return upload


# --------------------------------------------------------------------- #
# complete                                                               #
# --------------------------------------------------------------------- #


async def complete_upload(
    session: AsyncSession,
    config: ReceiverConfig,
    temp_store: TempStore,
    device: Device,
    upload_id: str,
) -> tuple[Upload, Transfer]:
    """Birlestir -> dogrula -> tasi. Hash uyusmazsa FAILED ve gecici dosyalar silinir."""
    upload = await get_upload(session, upload_id, device)
    transfer = await session.get(Transfer, upload.transfer_id) if upload.transfer_id else None

    if upload.status == "COMPLETED":
        return upload, transfer  # type: ignore[return-value]
    if upload.status not in ACTIVE_STATUSES:
        raise ConflictError("Bu aktarim tamamlanamaz.")

    received = await _received_indexes(session, upload_id)
    missing = [i for i in range(upload.total_chunks) if i not in set(received)]
    if missing:
        raise ConflictError("Aktarim eksik, tum parcalar alinamadi.")

    upload.status = "VERIFYING"
    if transfer is not None:
        transfer.status = "VERIFYING"
    await session.flush()

    try:
        assembled, digest, size = temp_store.assemble(upload_id, upload.total_chunks)
    except (OSError, FileNotFoundError) as exc:
        return await _fail(
            session, temp_store, upload, transfer, "Aktarim tamamlanamadi.", detail=str(exc)
        )

    # sha256 init'te zorunlu (PRD §29); eski hash'siz kayitlarda guvenli tarafa
    # dusup aktarimi reddeder.
    if size != upload.size or digest != upload.sha256:
        await _fail(
            session,
            temp_store,
            upload,
            transfer,
            "Dosya dogrulanamadi, aktarim bozulmus olabilir.",
            detail=f"expected={upload.sha256} actual={digest} size={size}/{upload.size}",
        )
        raise ChecksumError()

    # --- hedef klasor + adlandirma + cakisma politikasi ---
    # Kilit altinda: exists() kontrolu ile os.replace arasina baska bir
    # tamamlama giremez (rename/skip politikanin yarista atlanmamasi icin).
    async with _completion_lock:
        try:
            target_row, target_dir = await targets.resolve_target_dir(
                session, config, upload.target_id
            )
            # Every completed transfer is grouped under the computer's local calendar date.
            # Reuse the same directory for all files received on the same day.
            target_dir = target_dir / datetime.now().date().isoformat()
            target_dir.mkdir(parents=True, exist_ok=True)

            final_name = apply_naming_template(
                config.naming_template,
                upload.filename,
                device_name=device.name,
                folder_name=target_row.name if target_row else "",
            )

            placement = plan_placement(target_dir, final_name, config.conflict_policy)
            if placement.skipped or placement.path is None:
                temp_store.cleanup(upload_id)
                upload.status = "CANCELLED"
                if transfer is not None:
                    transfer.status = "CANCELLED"
                    transfer.completed_at = _now()
                    transfer.error_message = "Ayni adli dosya zaten var, atlandi."
                await session.flush()
                return upload, transfer  # type: ignore[return-value]

            roots = targets.effective_roots(config)
            stored = atomic_move(assembled, placement.path, roots)
        except Exception as exc:  # noqa: BLE001 - VERIFYING'de takilma kalmasin
            await _fail(
                session, temp_store, upload, transfer, "Dosya kaydedilemedi.", detail=str(exc)
            )
            raise ConflictError("Dosya kaydedilemedi.") from exc

    temp_store.cleanup(upload_id)

    upload.status = "COMPLETED"
    upload.stored_path = str(stored)
    upload.received_bytes = size
    if transfer is not None:
        started = _aware(transfer.started_at)
        duration = max(0.0, (_now() - started).total_seconds())
        transfer.status = "COMPLETED"
        transfer.verified = True
        transfer.stored_filename = placement.file_name
        transfer.stored_path = str(stored)
        transfer.sha256 = digest
        transfer.completed_at = _now()
        transfer.duration = duration
        transfer.average_speed = (size / duration) if duration > 0 else None
    await session.flush()
    await audit.record_audit(
        session,
        audit.UPLOAD_COMPLETED,
        device_id=device.id,
        detail={"upload_id": upload_id, "stored_filename": placement.file_name},
    )
    log.info(
        "transfer tamamlandi",
        extra={"category": "transfer", "upload_id": upload_id, "size": size},
    )
    return upload, transfer  # type: ignore[return-value]


async def cancel_upload(
    session: AsyncSession,
    temp_store: TempStore,
    device: Device,
    upload_id: str,
) -> Upload:
    upload = await get_upload(session, upload_id, device)
    temp_store.cleanup(upload_id)
    upload.status = "CANCELLED"
    transfer = await session.get(Transfer, upload.transfer_id) if upload.transfer_id else None
    if transfer is not None and transfer.status not in ("COMPLETED",):
        transfer.status = "CANCELLED"
        transfer.completed_at = _now()
    await session.flush()
    return upload


# --------------------------------------------------------------------- #
# yardimcilar                                                            #
# --------------------------------------------------------------------- #


async def received_indexes(session: AsyncSession, upload_id: str) -> list[int]:
    """Bu upload icin kayitli chunk indeksleri (resume ve ilerleme icin)."""
    return await _received_indexes(session, upload_id)


async def _received_indexes(session: AsyncSession, upload_id: str) -> list[int]:
    rows = (
        await session.execute(
            select(UploadChunk.chunk_index).where(UploadChunk.upload_id == upload_id)
        )
    ).scalars().all()
    return sorted(rows)


async def _received_bytes(session: AsyncSession, upload_id: str) -> int:
    total = (
        await session.execute(
            select(func.coalesce(func.sum(UploadChunk.size), 0)).where(
                UploadChunk.upload_id == upload_id
            )
        )
    ).scalar_one()
    return int(total)


async def _prune_chunks(session: AsyncSession, upload_id: str, keep: list[int]) -> None:
    rows = (
        (await session.execute(select(UploadChunk).where(UploadChunk.upload_id == upload_id)))
        .scalars()
        .all()
    )
    alive = set(keep)
    for row in rows:
        if row.chunk_index not in alive:
            await session.delete(row)
    await session.flush()


async def _fail(
    session: AsyncSession,
    temp_store: TempStore,
    upload: Upload,
    transfer: Transfer | None,
    message: str,
    *,
    detail: str | None = None,
) -> tuple[Upload, Transfer | None]:
    """Upload'i FAILED yapar ve gecici dosyalari temizler. Teknik detay yalnizca loga gider."""
    temp_store.cleanup(upload.id)
    upload.status = "FAILED"
    upload.error_message = message
    if transfer is not None:
        transfer.status = "FAILED"
        transfer.error_message = message
        transfer.completed_at = _now()
    await session.flush()
    await audit.record_audit(
        session,
        audit.UPLOAD_FAILED,
        device_id=upload.device_id,
        detail={"upload_id": upload.id, "reason": message},
    )
    log.warning(
        "transfer basarisiz",
        extra={"category": "error", "upload_id": upload.id, "detail": detail},
    )
    return upload, transfer
