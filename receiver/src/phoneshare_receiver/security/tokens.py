"""Cihaz token'lari ve eslestirme kodlari (PRD §12/§13/§49).

Token DB'de yalnizca SHA-256 hash olarak tutulur; plaintext hicbir yerde saklanmaz.
Karsilastirmalar sabit zamanli (`secrets.compare_digest`) yapilir.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

TOKEN_BYTES = 32
DEVICE_ID_BYTES = 12


class AuthError(Exception):
    """Kimlik dogrulama hatasi (HTTP 401)."""

    def __init__(self, message: str = "Yetkisiz.") -> None:
        super().__init__(message)
        self.message = message


def generate_device_token() -> str:
    """URL-safe, tahmin edilemez cihaz token'i."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def generate_device_id() -> str:
    return secrets.token_hex(DEVICE_ID_BYTES)


def hash_token(token: str) -> str:
    """Token -> hex SHA-256. Girdi asla loglanmaz."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def tokens_match(token: str, token_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), token_hash)


def generate_pairing_code() -> str:
    """PRD §12 formati: `482-193` (6 hane, ortada tire)."""
    digits = "".join(secrets.choice("0123456789") for _ in range(6))
    return f"{digits[:3]}-{digits[3:]}"


def normalize_pairing_code(value: str) -> str:
    """Kullanicidan gelen kodu kanonik `NNN-NNN` formatina cevirir."""
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    if len(digits) != 6:
        raise AuthError("Eslestirme kodu 6 haneli olmalidir.")
    return f"{digits[:3]}-{digits[3:]}"


def hash_pairing_code(code: str) -> str:
    return hashlib.sha256(f"pair:{code}".encode()).hexdigest()


def extract_bearer(header_value: str | None) -> str:
    """`Authorization: Bearer <token>` basligindan token'i cikarir."""
    if not header_value:
        raise AuthError("Authorization basligi eksik.")
    parts = header_value.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise AuthError("Authorization basligi 'Bearer <token>' formatinda olmalidir.")
    return parts[1].strip()
