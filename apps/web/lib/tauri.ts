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

export interface ReceiverConfig {
  base_folder?: string | null;
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

/** Masaustu uygulamasinin guvenli, sir icermeyen ayarlarini getirir. */
export function getDesktopConfig(): Promise<ReceiverConfig | null> {
  return invokeTauri<ReceiverConfig>("get_config");
}

/** Yerel Windows klasor secicisini acar. Iptalde `null` doner. */
export function pickSaveFolder(): Promise<string | null> {
  return invokeTauri<string>("pick_folder", { title: "Choose save folder" });
}

/** Ana kaydetme klasorunu degistirir ve receiver ayarini es zamanli gunceller. */
export function setSaveFolder(baseFolder: string): Promise<ReceiverConfig | null> {
  return invokeTauri<ReceiverConfig>("update_config", {
    patch: { base_folder: baseFolder },
  });
}

/** Windows oturumu acildiginda PhoneShare'in otomatik baslama durumunu getirir. */
export function getAutostart(): Promise<boolean | null> {
  return invokeTauri<boolean>("get_autostart");
}

/** Windows otomatik baslatma kaydini gunceller ve gercek kayit durumunu dondurur. */
export function setAutostart(enabled: boolean): Promise<boolean | null> {
  return invokeTauri<boolean>("set_autostart", { enabled });
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
