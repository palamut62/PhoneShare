/**
 * PhoneShare paylasilan sabitleri (PRD §27, §31, §32, §52).
 * Receiver tarafindaki karsiligi: `receiver/src/phoneshare_receiver/core/config.py`.
 */

/* ------------------------------ chunk ------------------------------ */

/** PRD §27 — varsayilan chunk boyutu: 8 MB. */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
export const MIN_CHUNK_SIZE = 64 * 1024;
export const MAX_CHUNK_SIZE = 64 * 1024 * 1024;

/* ------------------------------ limitler --------------------------- */

/** PRD §52 — tek dosya: 10 GB. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024;
/** PRD §52 — toplam transfer: 50 GB. */
export const MAX_TOTAL_TRANSFER = 50 * 1024 * 1024 * 1024;

/* ------------------------------ pairing ---------------------------- */

/** PRD §12 — eslestirme kodu 5 dakika gecerlidir. */
export const PAIRING_CODE_TTL_SEC = 300;
/** Kod formati: `482-193`. */
export const PAIRING_CODE_PATTERN = /^\d{3}-\d{3}$/;

/* ------------------------------ durumlar --------------------------- */

/** PRD §26 — transfer kuyrugu durum makinesi. */
export const TRANSFER_STATUSES = [
  "QUEUED",
  "PREPARING",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TERMINAL_TRANSFER_STATUSES: readonly TransferStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

/* ------------------------------ cakisma ---------------------------- */

/** PRD §31 — varsayilan: "Yeni Isim Olustur" (`rename`). */
export const CONFLICT_POLICIES = [
  "rename",
  "overwrite",
  "skip",
  "version",
] as const;

export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];

export const DEFAULT_CONFLICT_POLICY: ConflictPolicy = "rename";

/* ------------------------------ adlandirma ------------------------- */

/** PRD §32 — otomatik adlandirma sablonu degiskenleri. */
export const NAMING_VARIABLES = [
  "date",
  "time",
  "device",
  "folder",
  "original",
  "counter",
  "extension",
] as const;

export type NamingVariable = (typeof NAMING_VARIABLES)[number];

/** Bos sablon = orijinal dosya adi korunur. */
export const DEFAULT_NAMING_TEMPLATE = "";

/* ------------------------------ ag --------------------------------- */

export const DEFAULT_RECEIVER_PORT = 8765;
export const HEALTH_POLL_INTERVAL_MS = 10_000;

/* ------------------------------ urun ------------------------------- */

export const PRODUCT_OWNER = {
  name: "Umut Çelik (palamut62)",
  x: "https://x.com/palamut62",
  github: "https://github.com/palamut62",
} as const;
