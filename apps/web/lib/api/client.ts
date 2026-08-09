/**
 * Receiver API istemcisi.
 *
 * PWA, receiver tarafindan `/` altindan servis edilir; bu yuzden **tum** istekler ayni
 * origin'e, goreli `/api/...` yoluna gider. Mutlak URL / env tabanli base URL yoktur.
 */

import { API_ROUTES } from "@phoneshare/shared-types";
import type {
  DeviceResponse,
  HealthResponse,
  PairConfirmResponse,
  PairStartResponse,
  RuleCreateRequest,
  RuleResponse,
  RuleUpdateRequest,
  SettingsResponse,
  SettingsUpdateRequest,
  SessionResponse,
  StatsResponse,
  TargetResponse,
  TransferListResponse,
} from "@phoneshare/shared-types";

import { errorFromResponse } from "@/lib/upload/http";
import { UploadError } from "@/lib/upload/errors";
import { getReceiverOrigin, isTauri } from "@/lib/tauri";
import { isSessionSentinel } from "@/lib/storage/session";

async function resolveApiUrl(path: string): Promise<string> {
  if (!isTauri()) return path;
  const origin = await getReceiverOrigin();
  return origin ? new URL(path, origin).toString() : path;
}

async function request<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(await resolveApiUrl(path), {
      ...rest,
      headers: {
        ...(rest.body ? { "Content-Type": "application/json" } : {}),
        ...(token && !isSessionSentinel(token) ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch (error) {
    throw new UploadError("network_error", { cause: error });
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** PRD §44/§45 — baglanti durumu. Kimlik gerektirmez. */
export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>(API_ROUTES.health, { cache: "no-store" });
}

/** PRD §12 — yeni eslestirme kodu ve QR icerigi uretir (body gerektirmez). */
export function startPairing(): Promise<PairStartResponse> {
  return request<PairStartResponse>(API_ROUTES.pair, { method: "POST" });
}

/** PRD §12 — eslestirme kodu ile cihazi baglar. */
export function confirmPairing(code: string, deviceName: string): Promise<PairConfirmResponse> {
  return request<PairConfirmResponse>(API_ROUTES.pairConfirm, {
    method: "POST",
    body: JSON.stringify({ code, device_name: deviceName }),
  });
}

/** Ana ekran PWA'sinda Safari'den kopyalanan HttpOnly cookie ile oturumu geri yukler. */
export function getCurrentSession(): Promise<SessionResponse> {
  return request<SessionResponse>("/api/session", { cache: "no-store" });
}

/** PRD §20/§93 — yalnizca sanal hedefler; gercek Windows yolu donmez. */
export function getTargets(token: string): Promise<TargetResponse[]> {
  return request<TargetResponse[]>(API_ROUTES.targets, { token, cache: "no-store" });
}

export function getTransfers(
  token: string,
  params: { q?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<TransferListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("limit", String(params.limit ?? 50));
  if (params.offset) search.set("offset", String(params.offset));
  return request<TransferListResponse>(`${API_ROUTES.transfers}?${search.toString()}`, {
    token,
    cache: "no-store",
  });
}

export function getSettings(token: string): Promise<SettingsResponse> {
  return request<SettingsResponse>(API_ROUTES.settings, { token, cache: "no-store" });
}

/** PRD §42/§43 — transfer istatistikleri. */
export function getStats(token: string): Promise<StatsResponse> {
  return request<StatsResponse>(API_ROUTES.stats, { token, cache: "no-store" });
}

export function updateSettings(
  token: string,
  patch: SettingsUpdateRequest,
): Promise<SettingsResponse> {
  return request<SettingsResponse>(API_ROUTES.settings, {
    token,
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/* ------------------------------ rules ------------------------------ */
/** PRD §33/§34 — klasor kurallari; priority kucuk olan once denenir. */
export function getRules(token: string): Promise<RuleResponse[]> {
  return request<RuleResponse[]>(API_ROUTES.rules, { token, cache: "no-store" });
}

export function createRule(token: string, payload: RuleCreateRequest): Promise<RuleResponse> {
  return request<RuleResponse>(API_ROUTES.rules, {
    token,
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRule(
  token: string,
  id: string,
  payload: RuleUpdateRequest,
): Promise<RuleResponse> {
  return request<RuleResponse>(API_ROUTES.rule(id), {
    token,
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteRule(token: string, id: string): Promise<void> {
  return request<void>(API_ROUTES.rule(id), { token, method: "DELETE" });
}

/** PRD §62 — eslesmis cihazlar. */
export function getDevices(token: string): Promise<DeviceResponse[]> {
  return request<DeviceResponse[]>(API_ROUTES.devices, { token, cache: "no-store" });
}

/** Eslestirmeyi kaldirir (PRD §13). */
export function removeDevice(token: string, deviceId: string): Promise<void> {
  return request<void>(API_ROUTES.device(deviceId), { token, method: "DELETE" });
}

/** PRD §46 — WebSocket adresi ayni origin uzerinden kurulur. */
export function buildWebSocketUrl(token: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const query = isSessionSentinel(token) ? "" : `?token=${encodeURIComponent(token)}`;
  return `${protocol}//${window.location.host}${API_ROUTES.ws}${query}`;
}
