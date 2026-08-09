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
