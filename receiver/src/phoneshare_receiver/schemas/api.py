"""PRD §57-60 API sozlesmesi — tum JSON alanlari snake_case."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TransferStatus = Literal[
    "QUEUED", "PREPARING", "UPLOADING", "VERIFYING", "COMPLETED", "FAILED", "CANCELLED"
]

ConflictPolicy = Literal["rename", "overwrite", "skip", "version"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


# --------------------------------------------------------------------- #
# Health                                                                 #
# --------------------------------------------------------------------- #


class ReceiverAddressResponse(BaseModel):
    """Telefonun deneyebilecegi receiver adresi (PRD §44/§47/§48)."""

    url: str
    host: str
    kind: Literal["lan", "tailscale", "loopback"]
    reachable_from_phone: bool
    label: str


class HealthResponse(BaseModel):
    status: str = "online"
    version: str
    device_name: str | None = None
    #: PRD §92 — urun sahibi metadata'si.
    owner: str = "Umut Celik (palamut62)"
    #: PRD §44/§47 — "telefonundan su adresi ac" icin aday adresler.
    addresses: list[ReceiverAddressResponse] = Field(default_factory=list)
    #: Istek loopback'ten mi geldi? PC'nin kendi paneli bunu gorur, telefon asla goremez.
    is_local_client: bool = False


# --------------------------------------------------------------------- #
# Pairing (PRD §12)                                                      #
# --------------------------------------------------------------------- #


class PairStartResponse(BaseModel):
    code: str
    expires_at: datetime
    qr_payload: str
    #: Telefonun deneyebilecegi adresler; sirali (LAN > Tailscale > loopback).
    addresses: list[ReceiverAddressResponse] = Field(default_factory=list)


class PairConfirmRequest(ApiModel):
    code: str = Field(min_length=6, max_length=16)
    device_name: str = Field(min_length=1, max_length=64)


class PairConfirmResponse(BaseModel):
    device_id: str
    token: str
    device_name: str


class SessionResponse(BaseModel):
    device_id: str
    device_name: str


# --------------------------------------------------------------------- #
# Devices (PRD §62)                                                      #
# --------------------------------------------------------------------- #


class DeviceResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    last_seen: datetime | None = None
    enabled: bool


# --------------------------------------------------------------------- #
# Targets (PRD §63) — gercek Windows yolu PWA'ya gonderilmez (PRD §93).  #
# --------------------------------------------------------------------- #


class TargetResponse(BaseModel):
    id: str
    name: str
    icon: str | None = None
    favorite: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime


class TargetCreateRequest(ApiModel):
    name: str = Field(min_length=1, max_length=128)
    path: str = Field(min_length=1, max_length=400)
    icon: str | None = Field(default=None, max_length=64)
    favorite: bool = False
    enabled: bool = True


class TargetUpdateRequest(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    path: str | None = Field(default=None, min_length=1, max_length=400)
    icon: str | None = Field(default=None, max_length=64)
    favorite: bool | None = None
    enabled: bool | None = None


# --------------------------------------------------------------------- #
# Uploads (PRD §58-60)                                                   #
# --------------------------------------------------------------------- #


class UploadInitRequest(ApiModel):
    filename: str = Field(min_length=1, max_length=512)
    size: int = Field(ge=0)
    mime_type: str | None = Field(default=None, max_length=255)
    target_id: str | None = Field(default=None, max_length=64)
    # PRD §29 — butunluk garantisi icin istemci hash'i ZORUNLU; hash'siz
    # transfer "dogrulanmis" gorunmesin diye opsiyonel bırakilmaz.
    sha256: str = Field(min_length=64, max_length=64)

    @field_validator("sha256")
    @classmethod
    def _hex(cls, value: str) -> str:
        lowered = value.lower()
        if any(ch not in "0123456789abcdef" for ch in lowered):
            raise ValueError("sha256 onaltilik olmalidir.")
        return lowered


class UploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int
    existing_chunks: list[int]
    transfer_id: str
    total_chunks: int


class ChunkResponse(BaseModel):
    upload_id: str
    chunk_index: int
    received_bytes: int
    received_chunks: int
    total_chunks: int


class UploadCompleteResponse(BaseModel):
    upload_id: str
    transfer_id: str
    status: TransferStatus
    verified: bool
    stored_filename: str | None = None
    target_id: str | None = None
    sha256: str | None = None
    size: int


# --------------------------------------------------------------------- #
# Transfers (PRD §64)                                                    #
# --------------------------------------------------------------------- #


class TransferResponse(BaseModel):
    id: str
    device_id: str | None = None
    target_id: str | None = None
    original_filename: str
    stored_filename: str | None = None
    size: int
    mime_type: str | None = None
    sha256: str | None = None
    status: TransferStatus
    verified: bool
    started_at: datetime
    completed_at: datetime | None = None
    duration: float | None = None
    average_speed: float | None = None
    error_message: str | None = None


class TransferListResponse(BaseModel):
    items: list[TransferResponse]
    total: int


# --------------------------------------------------------------------- #
# Stats (PRD §42/§43)                                                    #
# --------------------------------------------------------------------- #


class StatsPeriod(BaseModel):
    files: int
    bytes: int
    avg_speed: float | None = None


class StatsDailyPoint(BaseModel):
    # PRD §43 — gunluk seri (son 14 gun), tarih formati YYYY-MM-DD.
    date: str
    files: int
    bytes: int


class StatsTarget(BaseModel):
    target_id: str
    name: str
    files: int
    bytes: int


class StatsFileType(BaseModel):
    mime_type: str
    files: int
    bytes: int


class StatsDevice(BaseModel):
    device_id: str
    name: str
    files: int
    bytes: int


class StatsResponse(BaseModel):
    today: StatsPeriod
    week: StatsPeriod
    month: StatsPeriod
    total: StatsPeriod
    daily: list[StatsDailyPoint]
    top_targets: list[StatsTarget]
    file_types: list[StatsFileType]
    by_device: list[StatsDevice]


# --------------------------------------------------------------------- #
# Settings (PRD §57)                                                     #
# --------------------------------------------------------------------- #


class SettingsResponse(BaseModel):
    device_name: str
    chunk_size: int
    max_file_bytes: int
    max_total_transfer_bytes: int
    conflict_policy: ConflictPolicy
    naming_template: str
    remember_last_target: bool
    telemetry_enabled: bool
    #: MVP DISI (PRD §76-78) — varsayilan kapali.
    ai_enabled: bool
    notify_enabled: bool


class SettingsUpdateRequest(ApiModel):
    device_name: str | None = Field(default=None, min_length=1, max_length=64)
    chunk_size: int | None = Field(default=None, ge=64 * 1024, le=64 * 1024 * 1024)
    max_file_bytes: int | None = Field(default=None, ge=1)
    max_total_transfer_bytes: int | None = Field(default=None, ge=1)
    conflict_policy: ConflictPolicy | None = None
    naming_template: str | None = Field(default=None, max_length=255)
    remember_last_target: bool | None = None
    telemetry_enabled: bool | None = None
    ai_enabled: bool | None = None
    notify_enabled: bool | None = None


# --------------------------------------------------------------------- #
# Rules (PRD §33/§34)                                                    #
# --------------------------------------------------------------------- #


#: Kural eslestirici tipleri — `services/rules.py` ile birebir.
RuleMatchType = Literal["extension", "filename", "source", "size", "date", "tag"]


class RuleResponse(BaseModel):
    id: str
    name: str
    priority: int
    enabled: bool
    match_type: RuleMatchType
    match_value: str
    target_id: str
    #: LEFT JOIN'den gelir; hedef silinmisse null (PRD §34).
    target_name: str | None = None
    rename: str | None = None
    conflict_policy: ConflictPolicy
    created_at: datetime


class RuleCreateRequest(ApiModel):
    name: str = Field(min_length=1, max_length=128)
    match_type: RuleMatchType
    match_value: str = Field(min_length=1, max_length=512)
    target_id: str = Field(min_length=1, max_length=64)
    rename: str | None = Field(default=None, max_length=255)
    conflict_policy: ConflictPolicy = "rename"
    #: None ise mevcut kurallardan max(priority)+1 (PRD §34).
    priority: int | None = Field(default=None, ge=0)
    enabled: bool = True

    @field_validator("rename")
    @classmethod
    def _rename_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class RuleUpdateRequest(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    match_type: RuleMatchType | None = None
    match_value: str | None = Field(default=None, min_length=1, max_length=512)
    target_id: str | None = Field(default=None, min_length=1, max_length=64)
    rename: str | None = Field(default=None, max_length=255)
    conflict_policy: ConflictPolicy | None = None
    priority: int | None = Field(default=None, ge=0)
    enabled: bool | None = None

    @field_validator("rename")
    @classmethod
    def _rename_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ErrorResponse(BaseModel):
    """PRD §71 — teknik detay ICERMEZ."""

    code: str
    message: str
