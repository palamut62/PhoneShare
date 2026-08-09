"""Receiver yapilandirmasi: %LOCALAPPDATA%\\PhoneShare\\config.json.

Merkezi bir control plane YOKTUR (PRD §94). Bu dosyadaki ayarlar tamamen yereldir.
Sirlar (pairing anahtari vb.) config.json'da DUZ METIN tutulmaz; bkz. `security/secrets_store.py`.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

APP_NAME = "PhoneShare"

# --- PRD §27 / §52 sabitleri ---
DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024  # 8 MiB
MIN_CHUNK_SIZE = 64 * 1024
MAX_CHUNK_SIZE = 64 * 1024 * 1024
DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB — tek dosya
DEFAULT_MAX_TOTAL_TRANSFER_BYTES = 50 * 1024 * 1024 * 1024  # 50 GB — toplam
MAX_CHUNK_INDEX = 1_000_000

# --- PRD §12 pairing ---
PAIRING_CODE_TTL_SEC = 300  # 5 dakika
PAIRING_MAX_ATTEMPTS = 5


def app_data_dir() -> Path:
    """Windows'ta %LOCALAPPDATA%\\PhoneShare, diger platformlarda ~/.phoneshare."""
    override = os.environ.get("PHONESHARE_HOME")
    if override:
        return Path(override)
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return Path(local) / APP_NAME
    return Path.home() / ".phoneshare"


def logs_dir() -> Path:
    return app_data_dir() / "logs"


def backups_dir() -> Path:
    return app_data_dir() / "backups"


def data_dir() -> Path:
    return app_data_dir() / "data"


def db_path() -> Path:
    return data_dir() / "phoneshare.db"


@dataclass
class ReceiverConfig:
    """Kullanicinin duzenleyebilecegi ayarlar (PRD §57 `/api/settings`)."""

    host: str = "0.0.0.0"
    port: int = 8765
    device_name: str = "Windows PC"

    # Ana klasor (PRD §10) — varsayilan hedeflerin ve `.temp` dizininin koku.
    base_folder: str | None = None
    # Yazma izni verilen KOK klasorler (allow-list). Bunlarin disina asla yazilmaz.
    allowed_roots: list[str] = field(default_factory=list)

    chunk_size: int = DEFAULT_CHUNK_SIZE
    max_file_bytes: int = DEFAULT_MAX_FILE_BYTES
    max_total_transfer_bytes: int = DEFAULT_MAX_TOTAL_TRANSFER_BYTES
    # Toplam disk kotasi (0 = sinirsiz).
    disk_quota_bytes: int = 0
    max_concurrent_uploads: int = 8
    # Bayt/saniye hiz limiti (0 = sinirsiz).
    rate_limit_bytes_per_sec: int = 0
    # Cihaz basina dakikada izin verilen istek sayisi.
    rate_limit_requests_per_min: int = 1200

    # PRD §31 — varsayilan cakisma politikasi "Yeni Isim Olustur".
    conflict_policy: str = "rename"
    # PRD §32 — otomatik adlandirma sablonu; bos ise orijinal ad korunur.
    naming_template: str = ""

    tls_certfile: str | None = None
    tls_keyfile: str | None = None
    mdns_enabled: bool = True
    tray_enabled: bool = True
    log_level: str = "INFO"
    # PRD §87 — telemetri varsayilan KAPALI.
    telemetry_enabled: bool = False
    # PRD §73 — son kullanilan hedefi hatirla.
    remember_last_target: bool = True

    # ------------------------------------------------------------------ #
    # MVP DISI (PRD §76-78). Varsayilan KAPALI; MVP tamamlanmadan         #
    # gelistirilmez. Kapaliyken hicbir ek is yapilmaz, veri disari cikmaz.#
    # ------------------------------------------------------------------ #

    # --- MVP DISI: OCR + siniflandirma ---
    ai_enabled: bool = False
    ai_classify_provider: str = "heuristic"
    ai_ocr_provider: str = "auto"
    ai_ocr_enabled: bool = True
    ai_ocr_max_bytes: int = 20 * 1024 * 1024
    ai_ocr_timeout_sec: float = 20.0
    ai_text_max_chars: int = 20_000
    ai_llm_base_url: str = "http://127.0.0.1:11434"
    ai_llm_model: str = "gemma3"
    ai_llm_api: str = "ollama"
    ai_llm_timeout_sec: float = 30.0
    ai_llm_send_text: bool = False

    # --- MVP DISI: Bildirimler ---
    notify_enabled: bool = False
    notify_events: list[str] = field(default_factory=list)
    notify_toast_enabled: bool = False
    notify_webhook_url: str | None = None
    notify_discord_webhook_url: str | None = None
    notify_smtp_host: str | None = None
    notify_smtp_port: int = 587
    notify_smtp_user: str | None = None
    notify_smtp_from: str | None = None
    notify_smtp_to: list[str] = field(default_factory=list)
    notify_smtp_starttls: bool = True
    notify_disk_low_bytes: int = 5 * 1024 * 1024 * 1024

    # --- Yedekleme (PRD §88) ---
    backup_enabled: bool = False
    backup_dir: str | None = None
    backup_interval_hours: int = 24
    backup_keep: int = 7

    @property
    def config_path(self) -> Path:
        return app_data_dir() / "config.json"

    def normalized_roots(self) -> list[Path]:
        roots: list[Path] = []
        for raw in self.allowed_roots:
            if not raw:
                continue
            try:
                roots.append(Path(raw).resolve(strict=False))
            except OSError:
                continue
        return roots

    def temp_dir(self) -> Path:
        """Chunk'larin biriktigi `.temp` dizini (PRD §30)."""
        base = self.base_folder or str(data_dir())
        return Path(base) / ".temp"

    def to_dict(self) -> dict:
        return asdict(self)


# Geriye donuk isim (bazi modullerde `AgentConfig` bekleniyordu).
AgentConfig = ReceiverConfig


def config_file() -> Path:
    return app_data_dir() / "config.json"


def load_config() -> ReceiverConfig:
    path = config_file()
    if not path.exists():
        return ReceiverConfig()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ReceiverConfig()
    known = set(ReceiverConfig.__dataclass_fields__)
    cfg = ReceiverConfig(**{k: v for k, v in raw.items() if k in known})
    return sanitize_config(cfg)


def sanitize_config(cfg: ReceiverConfig) -> ReceiverConfig:
    """Sinir disi degerleri guvenli araliga cekerek dogrular."""
    cfg.chunk_size = max(MIN_CHUNK_SIZE, min(MAX_CHUNK_SIZE, int(cfg.chunk_size)))
    cfg.max_file_bytes = max(1, int(cfg.max_file_bytes))
    cfg.max_total_transfer_bytes = max(1, int(cfg.max_total_transfer_bytes))
    cfg.disk_quota_bytes = max(0, int(cfg.disk_quota_bytes))
    cfg.max_concurrent_uploads = max(1, min(500, int(cfg.max_concurrent_uploads)))
    cfg.rate_limit_bytes_per_sec = max(0, int(cfg.rate_limit_bytes_per_sec))
    cfg.rate_limit_requests_per_min = max(1, int(cfg.rate_limit_requests_per_min))
    cfg.port = max(1, min(65535, int(cfg.port)))
    if cfg.conflict_policy not in ("rename", "overwrite", "skip", "version"):
        cfg.conflict_policy = "rename"

    # --- MVP disi alanlar ---
    if cfg.ai_classify_provider not in ("heuristic", "llm"):
        cfg.ai_classify_provider = "heuristic"
    if cfg.ai_ocr_provider not in ("auto", "tesseract", "paddleocr", "none"):
        cfg.ai_ocr_provider = "auto"
    if cfg.ai_llm_api not in ("ollama", "openai"):
        cfg.ai_llm_api = "ollama"
    cfg.ai_ocr_max_bytes = max(0, int(cfg.ai_ocr_max_bytes))
    cfg.ai_ocr_timeout_sec = max(1.0, float(cfg.ai_ocr_timeout_sec))
    cfg.ai_llm_timeout_sec = max(1.0, float(cfg.ai_llm_timeout_sec))
    cfg.ai_text_max_chars = max(100, min(1_000_000, int(cfg.ai_text_max_chars)))

    cfg.notify_smtp_port = max(1, min(65535, int(cfg.notify_smtp_port)))
    cfg.notify_events = [str(e).strip() for e in (cfg.notify_events or []) if str(e).strip()]
    cfg.notify_smtp_to = [str(e).strip() for e in (cfg.notify_smtp_to or []) if str(e).strip()]
    cfg.notify_disk_low_bytes = max(0, int(cfg.notify_disk_low_bytes))

    cfg.backup_interval_hours = max(1, min(24 * 30, int(cfg.backup_interval_hours)))
    cfg.backup_keep = max(1, min(365, int(cfg.backup_keep)))
    return cfg


def save_config(cfg: ReceiverConfig) -> Path:
    path = config_file()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(cfg.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)
    return path
