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
export function toUserFacingError(error: unknown, deviceName = "computer"): UserFacingError {
  const code: UploadErrorCode =
    error instanceof UploadError ? error.code : inferCodeFromUnknown(error);

  switch (code) {
    case "unauthorized":
      return {
        code,
        title: "Pairing invalid",
        message: "This device is no longer paired with the computer. Pair it again.",
        actionLabel: "Pair Again",
        action: "pair",
        retryable: false,
      };
    case "forbidden":
      return {
        code,
        title: "Permission denied",
        message: "You do not have permission for this action. Check the target settings on the computer.",
        actionLabel: "Settings",
        action: "settings",
        retryable: false,
      };
    case "not_found":
      return {
        code,
        title: "Not found",
        message: "The operation could not be found. Try sending the file again.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: false,
      };
    case "conflict":
      return {
        code,
        title: "Transfer interrupted",
        message: "Some file chunks are missing. Retrying will continue where it stopped.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    case "too_large":
      return {
        code,
        title: "File too large",
        message: "The file exceeds the size limit configured on the computer.",
        actionLabel: "Settings",
        action: "settings",
        retryable: false,
      };
    case "validation_error":
      return {
        code,
        title: "Send rejected",
        message: "The file information was not accepted. Select the file again and retry.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: false,
      };
    case "checksum_mismatch":
      return {
        code,
        title: "File verification failed",
        message: "The complete file did not reach the computer and was not saved. Try again.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: false,
      };
    case "rate_limited":
      return {
        code,
        title: "Too many requests",
        message: "Too many requests were sent. PhoneShare will retry shortly.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    case "insufficient_storage":
      return {
        code,
        title: "Not enough disk space",
        message: "The computer does not have enough disk space. Free some space and try again.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: false,
      };
    case "server_error":
      return {
        code,
        title: "Computer could not respond",
        message: `${deviceName} encountered an unexpected problem. Try again shortly.`,
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    case "network_error":
      return {
        code,
        title: "Computer unreachable",
        message: `${deviceName} must be on with PhoneShare Receiver running. Make sure you are on the same network.`,
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    case "offline":
      return {
        code,
        title: "Computer offline",
        message: "The computer is offline. It must be online to receive files.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    case "cancelled":
      return {
        code,
        title: "Transfer cancelled",
        message: "You stopped the transfer.",
        actionLabel: "Try Again",
        action: "retry",
        retryable: true,
      };
    default:
      return {
        code: "unknown",
        title: "Something went wrong",
        message: "The transfer could not be completed because of an unexpected problem. Try again.",
        actionLabel: "Try Again",
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
