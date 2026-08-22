"""/api/uploads — chunk upload akisi (PRD §58-§60).

Chunk govdesi iki bicimde kabul edilir:
  1. `application/octet-stream` ham govde + `?chunk_index=&chunk_hash=` (tercih edilen)
  2. `multipart/form-data` alanlari: `chunk_index`, `chunk_hash`, `file`
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import TooLargeError, ValidationError
from ...core.state import ReceiverState
from ...models import Device
from ...schemas import (
    ChunkResponse,
    UploadCompleteResponse,
    UploadInitRequest,
    UploadInitResponse,
)
from ...services import uploads as uploads_service
from ..deps import current_device, get_session, get_state

router = APIRouter(prefix="/uploads", tags=["uploads"])

#: Ham govde icin guvenlik payi (multipart basliklari + hizalama).
BODY_SLACK = 64 * 1024


@router.post("/init", response_model=UploadInitResponse)
async def init_upload(
    payload: UploadInitRequest,
    device: Device = Depends(current_device),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> UploadInitResponse:
    result = await uploads_service.init_upload(
        session,
        state.config,
        state.temp_store,
        device,
        filename=payload.filename,
        size=payload.size,
        mime_type=payload.mime_type,
        target_id=payload.target_id,
        sha256=payload.sha256,
    )
    upload = result.upload
    await state.hub.broadcast(
        "transfer.started",
        {"transfer_id": upload.transfer_id, "filename": upload.filename, "size": upload.size},
    )
    return UploadInitResponse(
        upload_id=upload.id,
        chunk_size=upload.chunk_size,
        existing_chunks=result.existing_chunks,
        transfer_id=upload.transfer_id or "",
        total_chunks=upload.total_chunks,
    )


async def _read_body(request: Request, limit: int) -> bytes:
    """Govdeyi limit asilirsa erken keserek okur (oversized request korumasi, PRD §83)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise TooLargeError("Gonderilen parca cok buyuk.")
    buffer = bytearray()
    async for block in request.stream():
        buffer.extend(block)
        if len(buffer) > limit:
            raise TooLargeError("Gonderilen parca cok buyuk.")
    return bytes(buffer)


@router.post("/{upload_id}/chunk", response_model=ChunkResponse)
async def upload_chunk(
    upload_id: str,
    request: Request,
    chunk_index: int | None = Query(default=None, ge=0),
    chunk_hash: str | None = Query(default=None, max_length=64),
    device: Device = Depends(current_device),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> ChunkResponse:
    upload = await uploads_service.get_upload(session, upload_id, device)
    limit = upload.chunk_size + BODY_SLACK

    content_type = (request.headers.get("content-type") or "").lower()
    if content_type.startswith("multipart/form-data"):
        # Starlette `form()` govdeyi tamamen okuyup diske spool ETTIKTEN sonra
        # asagidaki boyut kontrolune gelir; kotayi atlayan disk doldurma vektorunu
        # kapatmak icin parse baslamadan once reddet (PRD §83 oversized request).
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > limit:
            raise TooLargeError("Gonderilen parca cok buyuk.")
        form = await request.form()
        raw_index = form.get("chunk_index")
        raw_hash = form.get("chunk_hash")
        part = form.get("file")
        if part is None or isinstance(part, str):
            raise ValidationError("Parca verisi eksik.")
        data = await part.read()
        if len(data) > limit:
            raise TooLargeError("Gonderilen parca cok buyuk.")
        try:
            index = int(str(raw_index))
        except (TypeError, ValueError) as exc:
            raise ValidationError("Parca sirasi gecersiz.") from exc
        digest = str(raw_hash) if raw_hash else None
    else:
        if chunk_index is None:
            raise ValidationError("Parca sirasi gecersiz.")
        index = chunk_index
        digest = chunk_hash
        data = await _read_body(request, limit)

    await state.bytes.consume(len(data))
    updated = await uploads_service.save_chunk(
        session,
        state.temp_store,
        device,
        upload_id,
        chunk_index=index,
        chunk_hash=digest,
        data=data,
    )
    received_chunks = len(await uploads_service.received_indexes(session, upload_id))
    await state.hub.broadcast(
        "transfer.progress",
        {
            "transfer_id": updated.transfer_id,
            "received_bytes": updated.received_bytes,
            "size": updated.size,
        },
    )
    return ChunkResponse(
        upload_id=upload_id,
        chunk_index=index,
        received_bytes=updated.received_bytes,
        received_chunks=received_chunks,
        total_chunks=updated.total_chunks,
    )


@router.post("/{upload_id}/complete", response_model=UploadCompleteResponse)
async def complete_upload(
    upload_id: str,
    device: Device = Depends(current_device),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> UploadCompleteResponse:
    upload, transfer = await uploads_service.complete_upload(
        session, state.config, state.temp_store, device, upload_id
    )
    await state.hub.broadcast(
        "transfer.completed",
        {"transfer_id": upload.transfer_id, "status": upload.status},
    )
    return UploadCompleteResponse(
        upload_id=upload.id,
        transfer_id=upload.transfer_id or "",
        status=upload.status,  # type: ignore[arg-type]
        verified=bool(transfer and transfer.verified),
        stored_filename=transfer.stored_filename if transfer else None,
        target_id=upload.target_id,
        sha256=transfer.sha256 if transfer else upload.sha256,
        size=upload.size,
    )


@router.delete("/{upload_id}", status_code=204)
async def cancel_upload(
    upload_id: str,
    device: Device = Depends(current_device),
    state: ReceiverState = Depends(get_state),
    session: AsyncSession = Depends(get_session),
) -> Response:
    await uploads_service.cancel_upload(session, state.temp_store, device, upload_id)
    return Response(status_code=204)
