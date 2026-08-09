/**
 * Ayni origin'e giden minimal HTTP katmani.
 * Mutlak URL / env tabanli base URL **kullanilmaz**: PWA receiver tarafindan servis edilir.
 */

import { isSessionSentinel } from "../storage/session";
import { UploadError, normalizeErrorCode, parseRetryAfter } from "./errors";
import type { FetchLike } from "./types";

export interface HttpContext {
  fetch: FetchLike;
  /** Cihaz token'i. Asla URL'e veya loga yazilmaz. */
  token?: string | null;
  signal?: AbortSignal;
}

function authHeaders(token?: string | null): Record<string, string> {
  return token && !isSessionSentinel(token) ? { Authorization: `Bearer ${token}` } : {};
}

/** Basarisiz yanittan `UploadError` uretir; teknik govde kullaniciya sizmaz. */
export async function errorFromResponse(response: Response): Promise<UploadError> {
  let code: unknown;
  try {
    const body = (await response.json()) as { code?: unknown };
    code = body?.code;
  } catch {
    code = undefined;
  }
  const retryAfterMs =
    response.status === 429 ? parseRetryAfter(response.headers.get("Retry-After")) : null;
  return new UploadError(normalizeErrorCode(code, response.status), {
    status: response.status,
    retryAfterMs,
  });
}

async function run(ctx: HttpContext, url: string, init: Parameters<FetchLike>[1]): Promise<Response> {
  let response: Response;
  try {
    response = await ctx.fetch(url, init);
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError") {
      throw error;
    }
    throw new UploadError("network_error", { cause: error });
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

export async function postJson<T>(ctx: HttpContext, url: string, body?: unknown): Promise<T> {
  const response = await run(ctx, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(ctx.token),
    },
    body: body === undefined ? null : JSON.stringify(body),
    signal: ctx.signal,
  });
  return (await response.json()) as T;
}

export async function postBinary<T>(
  ctx: HttpContext,
  url: string,
  body: ArrayBuffer | Uint8Array,
): Promise<T> {
  const response = await run(ctx, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      ...authHeaders(ctx.token),
    },
    body: body as BodyInit,
    signal: ctx.signal,
  });
  return (await response.json()) as T;
}

export async function del(ctx: HttpContext, url: string): Promise<void> {
  await run(ctx, url, { method: "DELETE", headers: authHeaders(ctx.token), signal: ctx.signal });
}
