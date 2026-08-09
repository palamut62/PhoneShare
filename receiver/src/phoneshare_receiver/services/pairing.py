"""Cihaz eslestirme (PRD §12/§13).

PC `POST /api/pair` ile 6 haneli `482-193` kodu uretir (5 dakika gecerli).
Telefon `POST /api/pair/confirm` ile kodu tuketip cihaz token'i alir.

Brute force korumasi (PRD §83):
- Oturum basina en fazla `PAIRING_MAX_ATTEMPTS` yanlis deneme; asilirsa oturum yakilir.
- Ustune IP basina siki hiz limiti (bkz. `api/routes/pair.py`).
"""

from __future__ import annotations

import json
import secrets
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.addresses import ReceiverAddress, best_address, with_pair_code
from ..core.config import PAIRING_CODE_TTL_SEC, PAIRING_MAX_ATTEMPTS
from ..core.errors import ForbiddenError, ValidationError
from ..models import Device, PairingSession
from ..security import audit
from ..security.tokens import (
    generate_device_id,
    generate_device_token,
    generate_pairing_code,
    hash_pairing_code,
    hash_token,
    normalize_pairing_code,
)


@dataclass(frozen=True, slots=True)
class PairingTicket:
    code: str
    expires_at: datetime
    qr_payload: str
    #: Telefonun deneyebilecegi adresler (LAN > Tailscale > loopback).
    addresses: tuple[ReceiverAddress, ...] = ()


@dataclass(frozen=True, slots=True)
class PairedDevice:
    device_id: str
    device_name: str
    token: str


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def start_pairing(
    session: AsyncSession,
    *,
    addresses: Sequence[ReceiverAddress],
    device_name: str = "Windows PC",
    ttl_sec: int = PAIRING_CODE_TTL_SEC,
) -> PairingTicket:
    """Yeni eslestirme oturumu acar. Kod DB'de hash olarak tutulur.

    `addresses` receiver'in KENDI tespit ettigi adaylardir (bkz. `core/addresses.py`);
    istemcinin `Host` basligi veya `request.base_url`'i ASLA kullanilmaz — aksi halde
    panel `127.0.0.1`, ters vekil ise yanlis port uretir ve telefon baglanamaz.
    """
    await purge_expired(session)

    code = generate_pairing_code()
    expires_at = _now() + timedelta(seconds=ttl_sec)
    entry = PairingSession(
        id=secrets.token_hex(8),
        code_hash=hash_pairing_code(code),
        expires_at=expires_at,
    )
    session.add(entry)
    await session.flush()

    pair_addresses = tuple(
        replace(item, url=with_pair_code(item.url, code)) for item in addresses
    )
    best = best_address(pair_addresses)
    qr_payload = json.dumps(
        {"v": 1, "url": best.url if best else "", "code": code, "name": device_name},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return PairingTicket(
        code=code,
        expires_at=expires_at,
        qr_payload=qr_payload,
        addresses=pair_addresses,
    )


async def purge_expired(session: AsyncSession) -> None:
    await session.execute(delete(PairingSession).where(PairingSession.expires_at < _now()))


async def confirm_pairing(
    session: AsyncSession,
    *,
    code: str,
    device_name: str,
) -> PairedDevice:
    """Kodu dogrular, tek kullanimlik olarak tuketir ve cihaz token'i uretir."""
    normalized = normalize_pairing_code(code)
    code_hash = hash_pairing_code(normalized)

    entry = (
        await session.execute(select(PairingSession).where(PairingSession.code_hash == code_hash))
    ).scalar_one_or_none()

    if entry is None or entry.consumed or _aware(entry.expires_at) < _now():
        # Aktif oturumlarin deneme sayaclarini artir; sinira gelenler yakilir.
        await _register_failed_attempt(session)
        await audit.record_audit(session, audit.AUTH_FAILED, detail={"reason": "pairing_code"})
        raise ForbiddenError("Eslestirme kodu gecersiz veya suresi dolmus.")

    name = (device_name or "").strip()
    if not name:
        raise ValidationError("Cihaz adi bos olamaz.")

    entry.consumed = True
    await session.execute(delete(PairingSession).where(PairingSession.id == entry.id))

    token = generate_device_token()
    device = Device(
        id=generate_device_id(),
        name=name[:64],
        token_hash=hash_token(token),
        last_seen=_now(),
        enabled=True,
    )
    session.add(device)
    await session.flush()
    await audit.record_audit(
        session, audit.DEVICE_PAIRED, device_id=device.id, detail={"name": device.name}
    )
    return PairedDevice(device_id=device.id, device_name=device.name, token=token)


async def _register_failed_attempt(session: AsyncSession) -> None:
    """Yanlis kod denemelerinde tum aktif oturumlarin sayacini artirir.

    Saldirgan hangi oturumu hedefledigini bilemedigi icin sayac oturum bazinda degil
    genel tutulur; sinira ulasan oturum silinir ve kullanicidan yeni kod istenir.
    """
    rows = (
        (await session.execute(select(PairingSession).where(PairingSession.expires_at >= _now())))
        .scalars()
        .all()
    )
    for row in rows:
        row.attempts += 1
        if row.attempts >= PAIRING_MAX_ATTEMPTS:
            await session.execute(delete(PairingSession).where(PairingSession.id == row.id))
