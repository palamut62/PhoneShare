/**
 * Hata eslemesi (PRD §71).
 * Teknik detay (IP, port, stack, dosya yolu) kullaniciya **asla** gosterilmez.
 */

import type { UploadErrorCode, UserFacingError } from "./types";

const KNOWN_CODES: readonly UploadErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "too_large",
  "validation_error",
  "checksum_mismatch",
  "rate_limited",
  "insufficient_storage",
  "server_error",
  "network_error",
  "offline",
  "cancelled",
  "unknown",
];

export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number | null;
  /** `429 Retry-After` degeri (ms). */
  readonly retryAfterMs: number | null;

  constructor(
    code: UploadErrorCode,
    options: { status?: number | null; retryAfterMs?: number | null; cause?: unknown } = {},
  ) {
    // Mesaj yalnizca gelistirici gunlugu icindir; UI `toUserFacingError` kullanir.
    super(`upload_error:${code}`);
    this.name = "UploadError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/** HTTP durum kodundan hata kodu turetir (docs/api.md hata sozlesmesi). */
export function codeFromStatus(status: number): UploadErrorCode {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 413:
      return "too_large";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    case 507:
      return "insufficient_storage";
    default:
      return status >= 500 ? "server_error" : "unknown";
  }
}

/** Sunucudan gelen `code` alanini guvenli sekilde normalize eder. */
export function normalizeErrorCode(raw: unknown, status?: number): UploadErrorCode {
  if (typeof raw === "string" && (KNOWN_CODES as readonly string[]).includes(raw)) {
    return raw as UploadErrorCode;
  }
  return typeof status === "number" ? codeFromStatus(status) : "unknown";
}

/** `Retry-After` basligini milisaniyeye cevirir (saniye veya HTTP-date). */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) return null;
  return Math.max(0, asDate - now);
}

const RETRYABLE: readonly UploadErrorCode[] = [
  "rate_limited",
  "server_error",
  "network_error",
  "offline",
  "conflict",
];

export function isRetryable(code: UploadErrorCode): boolean {
  return RETRYABLE.includes(code);
}

/** PRD §71 — kullanici dostu, eylem iceren Turkce mesajlar. */
export function toUserFacingError(error: unknown, deviceName = "bilgisayar"): UserFacingError {
  const code: UploadErrorCode =
    error instanceof UploadError ? error.code : inferCodeFromUnknown(error);

  switch (code) {
    case "unauthorized":
      return {
        code,
        title: "Eşleştirme geçersiz",
        message:
          "Bu cihazın bilgisayarla bağlantısı kaldırılmış görünüyor. Yeniden eşleştirmeniz gerekiyor.",
        actionLabel: "Yeniden Eşleştir",
        action: "pair",
        retryable: false,
      };
    case "forbidden":
      return {
        code,
        title: "İzin verilmedi",
        message: "Bu işlem için yetkiniz yok. Bilgisayardaki hedef ayarlarını kontrol edin.",
        actionLabel: "Ayarlar",
        action: "settings",
        retryable: false,
      };
    case "not_found":
      return {
        code,
        title: "Bulunamadı",
        message: "İşlem kaydı bulunamadı. Dosyayı yeniden göndermeyi deneyin.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: false,
      };
    case "conflict":
      return {
        code,
        title: "Transfer yarıda kalmış",
        message: "Dosyanın bazı parçaları eksik kaldı. Tekrar denediğinizde kaldığı yerden devam eder.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    case "too_large":
      return {
        code,
        title: "Dosya çok büyük",
        message:
          "Dosya, bilgisayarda tanımlı boyut sınırını aşıyor. Bilgisayar ayarlarından sınırı artırabilirsiniz.",
        actionLabel: "Ayarlar",
        action: "settings",
        retryable: false,
      };
    case "validation_error":
      return {
        code,
        title: "Gönderim reddedildi",
        message: "Dosya bilgileri kabul edilmedi. Dosyayı yeniden seçip tekrar deneyin.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: false,
      };
    case "checksum_mismatch":
      return {
        code,
        title: "Dosya doğrulanamadı",
        message:
          "Dosya bilgisayara eksiksiz ulaşmadı ve güvenlik için kaydedilmedi. Tekrar göndermeyi deneyin.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: false,
      };
    case "rate_limited":
      return {
        code,
        title: "Çok fazla istek",
        message: "Kısa sürede çok fazla istek gönderildi. Birazdan otomatik olarak tekrar denenecek.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    case "insufficient_storage":
      return {
        code,
        title: "Disk alanı yetersiz",
        message: "Bilgisayarda yeterli disk alanı bulunmuyor. Yer açtıktan sonra tekrar deneyin.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: false,
      };
    case "server_error":
      return {
        code,
        title: "Bilgisayar yanıt veremedi",
        message: `${deviceName} beklenmedik bir sorunla karşılaştı. Birazdan tekrar deneyin.`,
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    case "network_error":
      return {
        code,
        title: "Bilgisayara ulaşılamıyor",
        message: `${deviceName} açık ve PhoneShare Receiver çalışıyor olmalı. Aynı ağda olduğunuzdan emin olun.`,
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    case "offline":
      return {
        code,
        title: "Bilgisayar çevrimdışı",
        message:
          "Bilgisayar çevrimdışı. Gönderim için bilgisayarın çevrimiçi olması gerekiyor.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    case "cancelled":
      return {
        code,
        title: "Transfer iptal edildi",
        message: "Gönderim sizin tarafınızdan durduruldu.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
    default:
      return {
        code: "unknown",
        title: "Bir sorun oluştu",
        message: "Beklenmeyen bir sorun nedeniyle gönderim tamamlanamadı. Tekrar deneyin.",
        actionLabel: "Tekrar Dene",
        action: "retry",
        retryable: true,
      };
  }
}

function inferCodeFromUnknown(error: unknown): UploadErrorCode {
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError") return "cancelled";
    if (name === "TypeError") return "network_error";
  }
  return "unknown";
}
