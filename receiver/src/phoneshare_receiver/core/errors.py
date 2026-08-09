"""Kullaniciya donen hata tipleri.

PRD §71: mesajlar Turkce, anlasilir ve **teknik detay sizdirmayan** olmalidir.
Teknik ayrinti yalnizca loga yazilir, HTTP yanitina konmaz.
"""

from __future__ import annotations


class ReceiverError(Exception):
    """Kullaniciya gosterilebilir hata."""

    status_code = 400
    code = "error"

    def __init__(self, message: str, *, detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        #: Yalnizca loglara yazilir, HTTP yanitina eklenmez.
        self.detail = detail


class NotFoundError(ReceiverError):
    status_code = 404
    code = "not_found"


class ConflictError(ReceiverError):
    status_code = 409
    code = "conflict"


class ValidationError(ReceiverError):
    status_code = 422
    code = "validation_error"


class ChecksumError(ReceiverError):
    status_code = 422
    code = "checksum_mismatch"

    def __init__(self, message: str = "Dosya dogrulanamadi, aktarim bozulmus olabilir.") -> None:
        super().__init__(message)


class InsufficientStorageError(ReceiverError):
    """PRD §53 — hedef surucude yeterli alan yok."""

    status_code = 507
    code = "insufficient_storage"

    def __init__(
        self,
        message: str = "Bilgisayarda yeterli disk alani bulunmuyor.",
        *,
        detail: str | None = None,
    ) -> None:
        super().__init__(message, detail=detail)


class TooLargeError(ReceiverError):
    """PRD §52 — boyut limiti asildi."""

    status_code = 413
    code = "too_large"


class ForbiddenError(ReceiverError):
    status_code = 403
    code = "forbidden"
