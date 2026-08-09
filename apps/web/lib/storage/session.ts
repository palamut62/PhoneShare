/**
 * Cihaz oturumu ve kullanici tercihleri (PRD §13, §22, §68, §73).
 * Token tarayici depolamasinda tutulur; hicbir yerde loglanmaz veya URL'ye eklenmez.
 */

import { DEFAULT_CHUNK_SIZE } from "@phoneshare/shared-config";

import { idbDelete, idbGet, idbSet } from "./idb";

const SESSION_KEY = "device_session";
const SESSION_BACKUP_KEY = "phoneshare.device_session";
const PREFS_KEY = "preferences";
const QUEUE_KEY = "queue_meta";
export const COOKIE_SESSION_TOKEN = "__cookie__";
export const DESKTOP_SESSION_TOKEN = "__desktop__";

export function isSessionSentinel(token: string | null | undefined): boolean {
  return token === COOKIE_SESSION_TOKEN || token === DESKTOP_SESSION_TOKEN;
}

export interface DeviceSession {
  deviceId: string;
  deviceName: string;
  token: string;
  pairedAt: number;
}

export type ThemePreference = "system" | "light" | "dark";
export type Language = "tr" | "en";

/** PRD §74 — hizli gonderim preseti; yalnizca yerel tercih (IndexedDB), sunucuya gitmez. */
export interface SendPreset {
  id: string;
  name: string;
  emoji: string;
  /** null = hedef atanmamis; mevcut hedef secimi korunur. */
  targetId: string | null;
}

export interface Preferences {
  theme: ThemePreference;
  language: Language;
  /** PRD §23 — Hizli Gonder: onay ekranini atlar. */
  quickSend: boolean;
  /** PRD §73 — varsayilan ACIK. */
  rememberLastTarget: boolean;
  lastTargetId: string | null;
  /** PRD §27 — istemci tercihi; sunucu yine de kendi degerini dayatabilir. */
  chunkSize: number;
  /** Ana ekrana ekleme rehberi kapatildi mi. */
  installGuideDismissed: boolean;
  /** PRD §74 — hizli gonderim presetleri. */
  presets: SendPreset[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  language: "tr",
  quickSend: false,
  rememberLastTarget: true,
  lastTargetId: null,
  chunkSize: DEFAULT_CHUNK_SIZE,
  installGuideDismissed: false,
  presets: [],
};

function readSessionBackup(): DeviceSession | null {
  try {
    const value = localStorage.getItem(SESSION_BACKUP_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as Partial<DeviceSession>;
    if (
      typeof session.deviceId !== "string" ||
      typeof session.deviceName !== "string" ||
      typeof session.token !== "string" ||
      typeof session.pairedAt !== "number"
    ) {
      localStorage.removeItem(SESSION_BACKUP_KEY);
      return null;
    }
    return session as DeviceSession;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<DeviceSession | null> {
  const stored = await idbGet<DeviceSession>(SESSION_KEY);
  if (stored) return stored;

  const backup = readSessionBackup();
  if (backup) await idbSet(SESSION_KEY, backup);
  return backup;
}

export async function setSession(session: DeviceSession): Promise<void> {
  await idbSet(SESSION_KEY, session);
  try {
    localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(session));
  } catch {
    // IndexedDB ana depodur; yerel yedek kullanilamiyorsa oturum yine calisir.
  }
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Kalici depolama tarayici tarafindan desteklenmeyebilir veya reddedilebilir.
  }
}

export async function clearSession(): Promise<void> {
  await idbDelete(SESSION_KEY);
  await idbDelete(QUEUE_KEY);
  try {
    localStorage.removeItem(SESSION_BACKUP_KEY);
  } catch {
    // Depolama erisimi kapaliysa silinecek bir yerel yedek yoktur.
  }
}

export async function getPreferences(): Promise<Preferences> {
  const stored = await idbGet<Partial<Preferences>>(PREFS_KEY);
  return { ...DEFAULT_PREFERENCES, ...(stored ?? {}) };
}

export function setPreferences(preferences: Preferences): Promise<void> {
  return idbSet(PREFS_KEY, preferences);
}

/** PRD §54 — yalnizca meta veri; dosya icerigi saklanmaz. */
export function saveQueueMeta<T>(items: T): Promise<void> {
  return idbSet(QUEUE_KEY, items);
}

export function loadQueueMeta<T>(): Promise<T | null> {
  return idbGet<T>(QUEUE_KEY);
}
