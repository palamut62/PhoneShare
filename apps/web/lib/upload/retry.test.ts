import { describe, expect, it, vi } from "vitest";

import { UploadError } from "./errors";
import { backoffDelay, nextDelayFor, withRetry } from "./retry";

const noSleep = async () => {};

describe("retry / backoff", () => {
  it("ustel olarak artar ve tavana takilir", () => {
    const options = { baseDelayMs: 500, maxDelayMs: 4000, jitter: 0 };
    expect(backoffDelay(1, options)).toBe(500);
    expect(backoffDelay(2, options)).toBe(1000);
    expect(backoffDelay(3, options)).toBe(2000);
    expect(backoffDelay(10, options)).toBe(4000);
  });

  it("jitter degeri araligin disina cikmaz", () => {
    const delay = backoffDelay(2, { baseDelayMs: 1000, jitter: 0.2, random: () => 1 });
    expect(delay).toBeLessThanOrEqual(2400);
    expect(delay).toBeGreaterThanOrEqual(1600);
  });

  it("429 Retry-After backoff yerine gecer", () => {
    const error = new UploadError("rate_limited", { status: 429, retryAfterMs: 7000 });
    expect(nextDelayFor(error, 1, { baseDelayMs: 500, jitter: 0 })).toBe(7000);
  });

  it("Retry-After maxDelay ile sinirlanir", () => {
    const error = new UploadError("rate_limited", { retryAfterMs: 999_000 });
    expect(nextDelayFor(error, 1, { maxDelayMs: 30_000 })).toBe(30_000);
  });

  it("gecici hatada yeniden dener ve sonunda basarili olur", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new UploadError("server_error", { status: 503 });
        return "ok";
      },
      { sleep: noSleep, jitter: 0 },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("kalici hatada hic yeniden denemez", async () => {
    const fn = vi.fn(async () => {
      throw new UploadError("checksum_mismatch", { status: 422 });
    });
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBeInstanceOf(UploadError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("maxAttempts asilinca son hatayi firlatir", async () => {
    const fn = vi.fn(async () => {
      throw new UploadError("network_error");
    });
    await expect(withRetry(fn, { sleep: noSleep, maxAttempts: 3 })).rejects.toBeInstanceOf(UploadError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("iptal edildiginde yeniden denemez", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    await expect(withRetry(fn, { sleep: noSleep, signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
