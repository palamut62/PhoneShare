import { describe, expect, it } from "vitest";

import {
  UploadError,
  codeFromStatus,
  isRetryable,
  normalizeErrorCode,
  parseRetryAfter,
  toUserFacingError,
} from "./errors";

describe("hata eslemesi (PRD §71)", () => {
  it("HTTP durumlarini API sozlesmesine gore esler", () => {
    expect(codeFromStatus(401)).toBe("unauthorized");
    expect(codeFromStatus(413)).toBe("too_large");
    expect(codeFromStatus(429)).toBe("rate_limited");
    expect(codeFromStatus(507)).toBe("insufficient_storage");
    expect(codeFromStatus(500)).toBe("server_error");
  });

  it("bilinmeyen sunucu kodunu duruma gore normalize eder", () => {
    expect(normalizeErrorCode("checksum_mismatch", 422)).toBe("checksum_mismatch");
    expect(normalizeErrorCode("saskin_kod", 422)).toBe("validation_error");
    expect(normalizeErrorCode(undefined, 503)).toBe("server_error");
  });

  it("Retry-After saniye degerini ms'e cevirir", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("garbage")).toBeNull();
  });

  it("Retry-After HTTP-date degerini destekler", () => {
    const now = Date.parse("2026-08-08T12:00:00Z");
    expect(parseRetryAfter("Sat, 08 Aug 2026 12:00:05 GMT", now)).toBe(5000);
  });

  it("yalnizca gecici hatalari yeniden denenebilir sayar", () => {
    expect(isRetryable("rate_limited")).toBe(true);
    expect(isRetryable("network_error")).toBe(true);
    expect(isRetryable("checksum_mismatch")).toBe(false);
    expect(isRetryable("too_large")).toBe(false);
  });

  it("kullaniciya teknik detay sizdirmaz", () => {
    const error = new UploadError("network_error", { cause: new Error("ECONNREFUSED 100.68.4.21:8765") });
    const shown = toUserFacingError(error, "UMUT-PC");
    expect(`${shown.title} ${shown.message}`).not.toMatch(/ECONNREFUSED|8765|100\.68/);
    expect(shown.message).toContain("UMUT-PC");
  });

  it("her hata mesajinda bir eylem butonu vardir", () => {
    const codes = [
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
    ] as const;
    for (const code of codes) {
      const shown = toUserFacingError(new UploadError(code));
      expect(shown.actionLabel.length).toBeGreaterThan(0);
      expect(shown.code).toBe(code);
    }
  });

  it("PC cevrimdisi mesaji PRD §54 metnini kullanir", () => {
    expect(toUserFacingError(new UploadError("offline")).message).toBe(
      "The computer is offline. It must be online to receive files.",
    );
  });

  it("token gecersizse yeniden eslestirme eylemi onerir", () => {
    expect(toUserFacingError(new UploadError("unauthorized")).action).toBe("pair");
  });

  it("AbortError iptal olarak eslenir", () => {
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(toUserFacingError(abort).code).toBe("cancelled");
  });
});
