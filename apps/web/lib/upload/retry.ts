/**
 * Ustel geri cekilme (exponential backoff) + `429 Retry-After` saygisi.
 */

import { UploadError, isRetryable } from "./errors";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 0-1 arasi rastgelelik orani. Testlerde 0 verilir. */
  jitter?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  random?: () => number;
}

export const DEFAULT_RETRY: Required<Pick<RetryOptions, "maxAttempts" | "baseDelayMs" | "maxDelayMs" | "jitter">> = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitter: 0.2,
};

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function abortError(): Error {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}

/** attempt 1 -> base, 2 -> 2*base, 3 -> 4*base ... `maxDelayMs` ile sinirli. */
export function backoffDelay(attempt: number, options: RetryOptions = {}): number {
  const base = options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs;
  const max = options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs;
  const jitter = options.jitter ?? DEFAULT_RETRY.jitter;
  const random = options.random ?? Math.random;

  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  if (jitter <= 0) return raw;
  const spread = raw * jitter;
  return Math.round(Math.max(0, raw - spread + random() * spread * 2));
}

/** `429` icin sunucunun verdigi bekleme suresi backoff'un yerine gecer. */
export function nextDelayFor(error: unknown, attempt: number, options: RetryOptions = {}): number {
  if (error instanceof UploadError && error.retryAfterMs !== null) {
    return Math.min(error.retryAfterMs, options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs);
  }
  return backoffDelay(attempt, options);
}

/** Yeniden denenebilir hatalarda `fn`'i tekrar calistirir. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_RETRY.maxAttempts;
  const doSleep = options.sleep ?? sleep;
  let attempt = 0;

  for (;;) {
    attempt += 1;
    if (options.signal?.aborted) throw abortError();
    try {
      return await fn(attempt);
    } catch (error) {
      if (isAbort(error)) throw error;
      const retryable = error instanceof UploadError ? isRetryable(error.code) : isNetworkish(error);
      if (!retryable || attempt >= maxAttempts) throw error;
      const delay = nextDelayFor(error, attempt, options);
      options.onRetry?.(attempt, delay, error);
      await doSleep(delay, options.signal);
    }
  }
}

export function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function isNetworkish(error: unknown): boolean {
  return error instanceof TypeError;
}
