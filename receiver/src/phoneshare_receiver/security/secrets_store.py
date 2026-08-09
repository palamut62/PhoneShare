"""Cihaz token'larinin sifreli saklanmasi.

Oncelik: Windows DPAPI (win32crypt, kullaniciya bagli) -> keyring -> son care olarak
0600 izinli yerel dosya (uyari loglanir). Token'lar config.json'a asla yazilmaz.
"""

from __future__ import annotations

import base64
import contextlib
import json
import os
from pathlib import Path
from typing import Any

from ..core.config import app_data_dir
from ..core.logging_setup import get_logger

log = get_logger("auth")

_KEYRING_SERVICE = "PhoneShareAgent"
_KEYRING_USER = "device-tokens"


def _secrets_file() -> Path:
    return app_data_dir() / "secrets.bin"


def _dpapi_encrypt(data: bytes) -> bytes | None:
    try:
        import win32crypt  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        return win32crypt.CryptProtectData(data, "PhoneShare", None, None, None, 0)
    except Exception:
        log.warning("DPAPI ile sifreleme basarisiz", extra={"category": "auth"})
        return None


def _dpapi_decrypt(data: bytes) -> bytes | None:
    try:
        import win32crypt  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        _desc, plain = win32crypt.CryptUnprotectData(data, None, None, None, 0)
        return plain
    except Exception:
        return None


def _keyring_set(payload: str) -> bool:
    try:
        import keyring  # type: ignore[import-not-found]

        keyring.set_password(_KEYRING_SERVICE, _KEYRING_USER, payload)
        return True
    except Exception:
        return False


def _keyring_get() -> str | None:
    try:
        import keyring  # type: ignore[import-not-found]

        return keyring.get_password(_KEYRING_SERVICE, _KEYRING_USER)
    except Exception:
        return None


def save_secrets(secrets: dict[str, Any]) -> str:
    """Sirlari saklar; kullanilan backend adini dondurur."""
    payload = json.dumps(secrets, ensure_ascii=False)
    raw = payload.encode("utf-8")

    blob = _dpapi_encrypt(raw)
    if blob is not None:
        path = _secrets_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"DPAPI1" + blob)
        _restrict(path)
        return "dpapi"

    if _keyring_set(payload):
        return "keyring"

    path = _secrets_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"PLAIN1" + base64.b64encode(raw))
    _restrict(path)
    log.warning(
        "DPAPI/keyring yok; token'lar yalnizca dosya izniyle korunuyor",
        extra={"category": "auth"},
    )
    return "file"


def load_secrets() -> dict[str, Any]:
    path = _secrets_file()
    if path.exists():
        data = path.read_bytes()
        if data.startswith(b"DPAPI1"):
            plain = _dpapi_decrypt(data[6:])
            if plain:
                return json.loads(plain.decode("utf-8"))
        elif data.startswith(b"PLAIN1"):
            return json.loads(base64.b64decode(data[6:]).decode("utf-8"))

    payload = _keyring_get()
    if payload:
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return {}
    return {}


def clear_secrets() -> None:
    path = _secrets_file()
    if path.exists():
        path.unlink()
    try:
        import keyring  # type: ignore[import-not-found]

        keyring.delete_password(_KEYRING_SERVICE, _KEYRING_USER)
    except Exception:
        pass


def _restrict(path: Path) -> None:
    """Dosya iznini sahibine daraltir (POSIX'te 0600; Windows'ta DPAPI zaten kullaniciya bagli)."""
    with contextlib.suppress(OSError):
        os.chmod(path, 0o600)
