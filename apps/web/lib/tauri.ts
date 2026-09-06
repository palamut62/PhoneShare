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

export interface ReceiverConnection {
  /** Always the sidecar's loopback HTTP management listener. */
  origin: string;
  /** Shell-lifetime capability. It is kept in memory and never added to URLs. */
  local_token: string;
}

let receiverConnectionPromise: Promise<ReceiverConnection | null> | null = null;

/**
 * Gets the management connection from native code. Do not derive this from the
 * public/TLS configuration: remote transitions must not change local authority.
 * A failed invoke is deliberately not cached, so restart recovery can retry.
 */
export function getReceiverConnection(): Promise<ReceiverConnection | null> {
  if (!isTauri()) return Promise.resolve(null);
  if (!receiverConnectionPromise) {
    receiverConnectionPromise = invokeTauri<ReceiverConnection>("get_receiver_connection").then(
      (connection) => {
        if (!connection?.origin || !connection.local_token) {
          receiverConnectionPromise = null;
          return null;
        }
        return connection;
      },
      () => {
        receiverConnectionPromise = null;
        return null;
      },
    );
  }
  return receiverConnectionPromise;
}

/** Compatibility helper for code that only needs the local management origin. */
export async function getReceiverOrigin(): Promise<string | null> {
  return (await getReceiverConnection())?.origin ?? null;
}

/** Call after the sidecar restarts or remote listener settings change. */
export function refreshReceiverConnection(): void {
  receiverConnectionPromise = null;
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
