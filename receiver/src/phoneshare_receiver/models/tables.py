"""PRD §61-65 tablolari.

Guvenlik notlari:
- `devices.token_hash` yalnizca HASH tutar; token DUZ METIN olarak ASLA saklanmaz (PRD §62).
- `pairing_sessions.code_hash` ayni sekilde hash'tir; kod plaintext saklanmaz.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, utcnow


class Device(Base):
    """Eslesmis telefon (PRD §62)."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Target(Base):
    """Sanal hedef (PRD §63/§20). PWA yalnizca `id` gorur, gercek yolu asla gormez (PRD §93)."""

    __tablename__ = "targets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    path: Mapped[str] = mapped_column(String(1024))
    icon: Mapped[str | None] = mapped_column(String(64), nullable=True)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class App(Base):
    """Kayitli masaustu uygulamasi (uzaktan baslatici). PWA yalnizca `id` gorur,
    gercek exe yolu API yanitlarinda ASLA yer almaz (PRD §93 ile ayni prensip)."""

    __tablename__ = "apps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    exe_path: Mapped[str] = mapped_column(String(1024))
    args: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Transfer(Base):
    """Transfer gecmisi (PRD §64/§37)."""

    __tablename__ = "transfers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    stored_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    size: Mapped[int] = mapped_column(BigInteger, default=0)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="QUEUED", index=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    average_speed: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(1024), nullable=True)


class Upload(Base):
    """Devam eden veya tamamlanmis chunk upload oturumu (PRD §27/§28)."""

    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    transfer_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    filename: Mapped[str] = mapped_column(String(512))
    size: Mapped[int] = mapped_column(BigInteger)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chunk_size: Mapped[int] = mapped_column(Integer)
    total_chunks: Mapped[int] = mapped_column(Integer)
    received_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(16), default="PREPARING", index=True)
    stored_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    __table_args__ = (
        Index("ix_uploads_resume", "device_id", "filename", "size", "sha256", "status"),
    )


class UploadChunk(Base):
    """Diske yazilmis tek bir chunk (idempotent kabul icin kayit)."""

    __tablename__ = "upload_chunks"

    upload_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("uploads.id", ondelete="CASCADE"), primary_key=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, primary_key=True)
    size: Mapped[int] = mapped_column(Integer)
    chunk_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("upload_id", "chunk_index", name="uq_upload_chunk"),)


class Rule(Base):
    """Klasor kurallari (PRD §33/§34). `priority` kucuk olan once denenir."""

    __tablename__ = "rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    priority: Mapped[int] = mapped_column(Integer, default=0, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    match_type: Mapped[str] = mapped_column(String(32))
    match_value: Mapped[str] = mapped_column(String(512))
    target_id: Mapped[str] = mapped_column(String(64))
    rename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conflict_policy: Mapped[str] = mapped_column(String(16), default="rename")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Setting(Base):
    """Anahtar/deger ayarlari (PRD §61)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AuditLog(Base):
    """Denetim kaydi (PRD §65). Token/parola/auth header ASLA yazilmaz (PRD §66)."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event: Mapped[str] = mapped_column(String(32), index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class PairingSession(Base):
    """Aktif eslestirme oturumu (PRD §12). Kod plaintext saklanmaz."""

    __tablename__ = "pairing_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
