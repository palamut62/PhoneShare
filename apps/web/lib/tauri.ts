/**
 * Tauri kabugu (masaustu panel) ile tarayici arasindaki kopru.
 *
 * Panel PWA'si Tauri webview icinde calisirken `window.__TAURI__` mevcuttur;
 * telefonda / normal tarayicida undefined olur. Tum erisimler burada
 * guard'lanir — tarayicida calisan kod asla Tauri'ye erismeye calismaz.
 */

/** Tauri webview icinde miyiz? (withGlobalTauri: true gerekir.) */
export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__)
  );
}

/**
 * Tauri komutunu cagirir. Tauri yoksa veya komut hata verirse `null` doner;
 * UI hata mesajini ayri ele alir.
 */
export async function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const tauri = (window as unknown as { __TAURI__: { core: { invoke: unknown } } }).__TAURI__;
    const invoke = tauri.core.invoke as (cmd: string, payload?: Record<string, unknown>) => Promise<T>;
    return await invoke(command, args);
  } catch {
    return null;
  }
}

/** QR'daki receiver adresinin Tauri config'inden gelen (Tailscale) degeri. */
export interface PairAddress {
  scheme: "http" | "https";
  host: string;
  /** Varsayilan port (80/443) ise null — URL'de port gosterilmez. */
  port?: number | null;
}

interface ReceiverConfig {
  receiver_port: number;
  receiver_tls: boolean;
}

let receiverOriginPromise: Promise<string | null> | null = null;

/** Tauri panelinin ayni makinedeki receiver'a baglanacagi origin. */
export function getReceiverOrigin(): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);
  receiverOriginPromise ??= invokeTauri<ReceiverConfig>("get_config").then((config) => {
    if (!config) return null;
    const scheme = config.receiver_tls ? "https" : "http";
    return `${scheme}://127.0.0.1:${config.receiver_port}`;
  });
  return receiverOriginPromise;
}

/** Masaustu kabugunun public config'i (`get_config` komutu). */
export interface PublicConfig {
  setup_completed: boolean;
  base_folder: string | null;
  base_url: string;
  receiver_host: string;
  receiver_port: number;
  receiver_tls: boolean;
  autostart: boolean;
  minimize_to_tray: boolean;
  theme: string;
  has_token: boolean;
  /** Hedef id -> gercek Windows yolu (PRD §93: yalnizca yerelde tutulur). */
  target_paths: Record<string, string>;
}

export function getDesktopConfig(): Promise<PublicConfig | null> {
  return invokeTauri<PublicConfig>("get_config");
}

/** Panel: receiver adresi uzak (Tailscale) moddaysa scheme + host doner. */
export function getPairAddress(): Promise<PairAddress | null> {
  return invokeTauri<PairAddress>("get_pair_address");
}

/**
 * Masaustu kabugu "Yeni Telefon Ekle" dialogunu acmak istiyor mu? (PRD §10 adim 6)
 * Bayrak tek seferliktir: ilk kurulum bitince veya tepsi menusunden set edilir.
 */
export function takePairPrompt(): Promise<boolean | null> {
  return invokeTauri<boolean>("take_pair_prompt");
}

/** Tailscale durumu (receiver: `tailscale_status` komutu). */
export interface TailscaleStatus {
  installed: boolean;
  running: boolean;
  dns_name: string | null;
  ipv4: string | null;
  remote_enabled: boolean;
}

export function getTailscaleStatus(): Promise<TailscaleStatus | null> {
  return invokeTauri<TailscaleStatus>("tailscale_status");
}

/** Uzaktan erisim acma/kapama sonucu (receiver: `set_remote_access` komutu). */
export interface TailscaleRemoteState {
  enabled: boolean;
  https: boolean;
  dns_name: string;
  ipv4?: string | null;
  message?: string | null;
}

/** Uzaktan erisimi acar/kapar. Komut hata verirse (Err) `null` doner. */
export function setRemoteAccess(enabled: boolean): Promise<TailscaleRemoteState | null> {
  return invokeTauri<TailscaleRemoteState>("set_remote_access", { enabled });
}

/* ------------------------------ hedef klasorler ------------------------------ */

/** Native klasor secici. Kullanici vazgecerse veya Tauri yoksa `null` doner. */
export function pickFolder(title?: string): Promise<string | null> {
  return invokeTauri<string>("pick_folder", { title: title ?? null });
}

/** Native dosya secici (.exe / .lnk filtresiyle). Kullanici vazgecerse veya Tauri yoksa `null` doner. */
export function pickFile(title?: string): Promise<string | null> {
  return invokeTauri<string>("pick_file", { title: title ?? null });
}

/** Yolu normalize eder ve klasoru olusturur; normalize edilmis yolu doner. */
export function ensureFolder(path: string): Promise<string | null> {
  return invokeTauri<string>("ensure_folder", { path });
}

/**
 * Hedef id -> gercek yol eslemesini yerelde saklar (PRD §93: yol API'ye gitmez).
 * Basarisizsa `null` doner.
 */
export function registerTargetPath(targetId: string, path: string): Promise<null | void> {
  return invokeTauri<void>("register_target_path", { targetId, path });
}

/** Hedef silindiginde yerel yol eslemesini kaldirir. */
export function forgetTargetPath(targetId: string): Promise<null | void> {
  return invokeTauri<void>("forget_target_path", { targetId });
}

/** PRD §40 — yalnizca izinli koklerin altindaki yollari acar. */
export function openPath(path: string): Promise<null | void> {
  return invokeTauri<void>("open_path", { path });
}

/** PRD §40 — "Klasorde Goster". */
export function revealInExplorer(path: string): Promise<null | void> {
  return invokeTauri<void>("reveal_in_explorer", { path });
}

/** Ana klasoru Windows Gezgini'nde acar. */
export function openBaseFolder(): Promise<null | void> {
  return invokeTauri<void>("open_base_folder");
}

/** Kurulumda onerilen ana klasor yolu. */
export function defaultBaseFolder(): Promise<string | null> {
  return invokeTauri<string>("default_base_folder");
}
