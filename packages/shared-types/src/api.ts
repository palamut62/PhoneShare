/**
 * PhoneShare Receiver API sozlesmesi (PRD §57-§60).
 * Tum alan adlari **snake_case**'dir ve receiver'daki Pydantic semalari ile birebir eslesir:
 * `receiver/src/phoneshare_receiver/schemas/api.py`
 */

import { z } from "zod";

/* ----------------------------- enum'lar ---------------------------- */

export const transferStatusSchema = z.enum([
  "QUEUED",
  "PREPARING",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const conflictPolicySchema = z.enum([
  "rename",
  "overwrite",
  "skip",
  "version",
]);

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/i, "sha256 onaltilik olmalidir");
const isoDateSchema = z.string().min(1);

/* ------------------------------ health ----------------------------- */

/** Telefonun deneyebilecegi receiver adresi (PRD §44/§47/§48). */
export const receiverAddressSchema = z.object({
  url: z.string(),
  host: z.string(),
  kind: z.enum(["lan", "tailscale", "loopback"]),
  reachable_from_phone: z.boolean(),
  label: z.string(),
});

export const healthResponseSchema = z.object({
  status: z.literal("online"),
  version: z.string(),
  device_name: z.string().nullable().optional(),
  owner: z.string().optional(),
  /** Eski receiver surumleri bu alani gondermez. */
  addresses: z.array(receiverAddressSchema).optional().default([]),
  /**
   * Istek loopback'ten mi geldi? Receiver'in soket adresine bakarak belirledigi tek
   * yetkili kaynak — PC paneli ile telefonu ayirmak icin (PRD §12). Spoof edilemez.
   */
  is_local_client: z.boolean().optional().default(false),
});

/* ----------------------------- pairing ----------------------------- */

export const pairStartResponseSchema = z.object({
  code: z.string().regex(/^\d{3}-\d{3}$/),
  expires_at: isoDateSchema,
  qr_payload: z.string(),
  /** Sirali adaylar: LAN > Tailscale > loopback. Eski receiver'da bos gelir. */
  addresses: z.array(receiverAddressSchema).optional().default([]),
});

export const pairConfirmRequestSchema = z.object({
  code: z.string().min(6).max(16),
  device_name: z.string().min(1).max(64),
});

export const pairConfirmResponseSchema = z.object({
  device_id: z.string(),
  token: z.string(),
  device_name: z.string(),
});

export const sessionResponseSchema = z.object({
  device_id: z.string(),
  device_name: z.string(),
});

/** QR icerigi (PRD §12). */
export const qrPayloadSchema = z.object({
  v: z.literal(1),
  url: z.string(),
  code: z.string(),
  name: z.string(),
});

/* ----------------------------- devices ----------------------------- */

export const deviceResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: isoDateSchema,
  last_seen: isoDateSchema.nullable().optional(),
  enabled: z.boolean(),
  /** WS ile su an bagli mi; eski receiver surumlerinde alan yoktur. */
  online: z.boolean().default(false),
});

/* ----------------------------- targets ----------------------------- */
/* Gercek Windows yolu yanitlarda YOKTUR (PRD §93).                     */

export const targetResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  favorite: z.boolean(),
  enabled: z.boolean(),
  created_at: isoDateSchema,
  updated_at: isoDateSchema,
});

export const targetCreateRequestSchema = z.object({
  name: z.string().min(1).max(128),
  path: z.string().min(1).max(400),
  icon: z.string().max(64).nullable().optional(),
  favorite: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export const targetUpdateRequestSchema = targetCreateRequestSchema.partial();

/* ------------------------------- apps -------------------------------- */
/* Gercek exe yolu yanitlarda YOKTUR — uzaktan baslatici.                */

export const appResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: isoDateSchema,
  enabled: z.boolean(),
  last_launched_at: isoDateSchema.nullable().optional(),
});

export const appCreateRequestSchema = z.object({
  name: z.string().min(1),
  exe_path: z.string().min(1),
  args: z.string().nullable().optional(),
});

/* ----------------------------- uploads ----------------------------- */

export const uploadInitRequestSchema = z.object({
  filename: z.string().min(1).max(512),
  size: z.number().int().nonnegative(),
  mime_type: z.string().max(255).nullable().optional(),
  target_id: z.string().max(64).nullable().optional(),
  sha256: sha256Schema.nullable().optional(),
});

export const uploadInitResponseSchema = z.object({
  upload_id: z.string(),
  chunk_size: z.number().int().positive(),
  existing_chunks: z.array(z.number().int().nonnegative()),
  transfer_id: z.string(),
  total_chunks: z.number().int().positive(),
});

export const chunkResponseSchema = z.object({
  upload_id: z.string(),
  chunk_index: z.number().int().nonnegative(),
  received_bytes: z.number().int().nonnegative(),
  received_chunks: z.number().int().nonnegative(),
  total_chunks: z.number().int().positive(),
});

export const uploadCompleteResponseSchema = z.object({
  upload_id: z.string(),
  transfer_id: z.string(),
  status: transferStatusSchema,
  verified: z.boolean(),
  stored_filename: z.string().nullable().optional(),
  target_id: z.string().nullable().optional(),
  sha256: z.string().nullable().optional(),
  size: z.number().int().nonnegative(),
});

/* ---------------------------- transfers ---------------------------- */

export const transferResponseSchema = z.object({
  id: z.string(),
  device_id: z.string().nullable().optional(),
  target_id: z.string().nullable().optional(),
  original_filename: z.string(),
  stored_filename: z.string().nullable().optional(),
  size: z.number().int().nonnegative(),
  mime_type: z.string().nullable().optional(),
  sha256: z.string().nullable().optional(),
  status: transferStatusSchema,
  verified: z.boolean(),
  started_at: isoDateSchema,
  completed_at: isoDateSchema.nullable().optional(),
  duration: z.number().nullable().optional(),
  average_speed: z.number().nullable().optional(),
  error_message: z.string().nullable().optional(),
});

export const transferListResponseSchema = z.object({
  items: z.array(transferResponseSchema),
  total: z.number().int().nonnegative(),
});

/* ------------------------------ stats ------------------------------ */

export const statsPeriodSchema = z.object({
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  avg_speed: z.number().nullable(),
});

export const statsDailyPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const statsTargetSchema = z.object({
  target_id: z.string(),
  name: z.string(),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const statsFileTypeSchema = z.object({
  mime_type: z.string(),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const statsDeviceSchema = z.object({
  device_id: z.string(),
  name: z.string(),
  files: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
});

export const statsResponseSchema = z.object({
  today: statsPeriodSchema,
  week: statsPeriodSchema,
  month: statsPeriodSchema,
  total: statsPeriodSchema,
  daily: z.array(statsDailyPointSchema),
  top_targets: z.array(statsTargetSchema),
  file_types: z.array(statsFileTypeSchema),
  by_device: z.array(statsDeviceSchema),
});

/* ----------------------------- settings ---------------------------- */

export const settingsResponseSchema = z.object({
  device_name: z.string(),
  chunk_size: z.number().int().positive(),
  max_file_bytes: z.number().int().positive(),
  max_total_transfer_bytes: z.number().int().positive(),
  conflict_policy: conflictPolicySchema,
  naming_template: z.string(),
  remember_last_target: z.boolean(),
  telemetry_enabled: z.boolean(),
  /** MVP DISI (PRD §76-78) — varsayilan kapali. */
  ai_enabled: z.boolean(),
  /** MVP DISI (PRD §76-78) — varsayilan kapali. */
  notify_enabled: z.boolean(),
  /** Uzaktan uygulama baslatma — varsayilan kapali, yalnizca PC panelinden acilir. */
  remote_launch_enabled: z.boolean(),
  /** Uzaktan dosya gezme/indirme — varsayilan kapali, yalnizca PC panelinden acilir. */
  remote_browse_enabled: z.boolean(),
});

export const settingsUpdateRequestSchema = settingsResponseSchema.partial();

/* ------------------------------ rules ------------------------------ */
/* PRD §33/§34 — klasor kurallari. `priority` kucuk olan once denenir.   */

export const ruleMatchTypeSchema = z.enum([
  "extension",
  "filename",
  "source",
  "size",
  "date",
  "tag",
]);

export const ruleResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.number().int().nonnegative(),
  enabled: z.boolean(),
  match_type: ruleMatchTypeSchema,
  match_value: z.string(),
  target_id: z.string(),
  /** LEFT JOIN'den gelir; hedef silinmisse null (PRD §34). */
  target_name: z.string().nullable().optional(),
  rename: z.string().nullable().optional(),
  conflict_policy: conflictPolicySchema,
  created_at: isoDateSchema,
});

export const ruleCreateRequestSchema = z.object({
  name: z.string().min(1).max(128),
  match_type: ruleMatchTypeSchema,
  match_value: z.string().min(1).max(512),
  target_id: z.string().min(1).max(64),
  rename: z.string().max(255).nullable().optional(),
  conflict_policy: conflictPolicySchema.default("rename"),
  /** Verilmezse sunucu max(priority)+1 atar (PRD §34). */
  priority: z.number().int().nonnegative().nullable().optional(),
  enabled: z.boolean().default(true),
});

export const ruleUpdateRequestSchema = ruleCreateRequestSchema.partial();

/* ------------------------------ hata ------------------------------- */

/** PRD §71 — teknik detay ICERMEZ. */
export const errorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/* --------------------------- websocket ----------------------------- */

export const wsEventSchema = z.object({
  event: z.enum([
    "receiver.online",
    "transfer.started",
    "transfer.progress",
    "transfer.completed",
    "transfer.failed",
    "device.paired",
  ]),
  data: z.record(z.unknown()),
});

/* ------------------------------ tipler ----------------------------- */

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReceiverAddress = z.infer<typeof receiverAddressSchema>;
export type PairStartResponse = z.infer<typeof pairStartResponseSchema>;
export type PairConfirmRequest = z.infer<typeof pairConfirmRequestSchema>;
export type PairConfirmResponse = z.infer<typeof pairConfirmResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type QrPayload = z.infer<typeof qrPayloadSchema>;
export type DeviceResponse = z.infer<typeof deviceResponseSchema>;
export type TargetResponse = z.infer<typeof targetResponseSchema>;
export type TargetCreateRequest = z.infer<typeof targetCreateRequestSchema>;
export type TargetUpdateRequest = z.infer<typeof targetUpdateRequestSchema>;
export type AppResponse = z.infer<typeof appResponseSchema>;
export type AppCreateRequest = z.infer<typeof appCreateRequestSchema>;
export type UploadInitRequest = z.infer<typeof uploadInitRequestSchema>;
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;
export type ChunkResponse = z.infer<typeof chunkResponseSchema>;
export type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;
export type TransferResponse = z.infer<typeof transferResponseSchema>;
export type TransferListResponse = z.infer<typeof transferListResponseSchema>;
export type StatsResponse = z.infer<typeof statsResponseSchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>;
export type RuleResponse = z.infer<typeof ruleResponseSchema>;
export type RuleCreateRequest = z.infer<typeof ruleCreateRequestSchema>;
export type RuleUpdateRequest = z.infer<typeof ruleUpdateRequestSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type WsEvent = z.infer<typeof wsEventSchema>;

export interface FileBrowserEntry {
  name: string;
  path: string;
  kind: "target" | "folder" | "file";
  size: number | null;
  modified_at: string | null;
  target_id: string;
}

export interface FileBrowserResponse {
  target_id: string | null;
  target_name?: string;
  path: string;
  entries: FileBrowserEntry[];
}

/** PRD §57 — receiver uc noktalari (istemci tarafinda tek dogruluk kaynagi). */
export const API_ROUTES = {
  health: "/api/health",
  pair: "/api/pair",
  pairConfirm: "/api/pair/confirm",
  devices: "/api/devices",
  device: (id: string) => `/api/devices/${encodeURIComponent(id)}`,
  targets: "/api/targets",
  files: "/api/files",
  fileDownload: "/api/files/download",
  target: (id: string) => `/api/targets/${encodeURIComponent(id)}`,
  apps: "/api/apps",
  app: (id: string) => `/api/apps/${encodeURIComponent(id)}`,
  appLaunch: (id: string) => `/api/apps/${encodeURIComponent(id)}/launch`,
  uploadInit: "/api/uploads/init",
  uploadChunk: (id: string) => `/api/uploads/${encodeURIComponent(id)}/chunk`,
  uploadComplete: (id: string) => `/api/uploads/${encodeURIComponent(id)}/complete`,
  upload: (id: string) => `/api/uploads/${encodeURIComponent(id)}`,
  transfers: "/api/transfers",
  transfer: (id: string) => `/api/transfers/${encodeURIComponent(id)}`,
  stats: "/api/stats",
  settings: "/api/settings",
  rules: "/api/rules",
  rule: (id: string) => `/api/rules/${encodeURIComponent(id)}`,
  ws: "/api/ws",
} as const;
