/**
 * Upload istemcisi tipleri (PRD §26-§30, §58-§60).
 * Bu modul saf TypeScript'tir; DOM disinda test edilebilir olmalidir.
 */

import type { TransferStatus } from "@phoneshare/shared-config";

export type { TransferStatus };

/** PRD §71 — kullaniciya teknik detay sizmayan hata kodlari. */
export type UploadErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "validation_error"
  | "checksum_mismatch"
  | "rate_limited"
  | "insufficient_storage"
  | "server_error"
  | "network_error"
  | "offline"
  | "cancelled"
  | "unknown";

/** Kullaniciya gosterilecek Turkce hata sunumu. */
export interface UserFacingError {
  code: UploadErrorCode;
  title: string;
  message: string;
  /** PRD §71 — her hata mesajinin bir eylemi olmalidir. */
  actionLabel: string;
  /** `retry` -> tekrar dene, `pair` -> yeniden eslestir, `settings` -> ayarlar, `dismiss` -> kapat. */
  action: "retry" | "pair" | "settings" | "dismiss";
  retryable: boolean;
}

export interface UploadProgress {
  /** Gonderilmis toplam bayt (resume ile atlananlar dahil). */
  uploadedBytes: number;
  totalBytes: number;
  /** 0-100 arasi. */
  percent: number;
  /** Bayt/saniye; olcum yoksa `null`. */
  bytesPerSecond: number | null;
  /** Kalan saniye; hesaplanamiyorsa `null`. */
  etaSeconds: number | null;
  chunksDone: number;
  totalChunks: number;
}

/** Kuyruktaki tek bir dosya (PRD §26). */
export interface QueueItem {
  id: string;
  filename: string;
  size: number;
  mimeType: string | null;
  targetId: string | null;
  status: TransferStatus;
  uploadId: string | null;
  transferId: string | null;
  sha256: string | null;
  progress: UploadProgress;
  error: UserFacingError | null;
  createdAt: number;
  updatedAt: number;
  /**
   * PRD §54 — dosya icerigi tarayicida kalici olarak saklanmaz.
   * Sayfa yenilendiginde `false` olur ve kullanicidan dosyayi tekrar secmesi istenir.
   */
  hasFileHandle: boolean;
}

export interface UploadHooks {
  onProgress?: (progress: UploadProgress) => void;
  onStatus?: (status: TransferStatus) => void;
}

/** Minimal `fetch` sozlesmesi — testlerde mock'lanir. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
    signal?: AbortSignal;
  },
) => Promise<Response>;

/** Dosya benzeri minimal arayuz (test edilebilirlik icin `File` yerine). */
export interface FileLike {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
}
