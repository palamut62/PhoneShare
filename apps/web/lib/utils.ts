import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** `4821 93` → `482-193` (PRD §12). Yalnizca rakam kabul edilir. */
export function formatPairingCode(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function isCompletePairingCode(value: string): boolean {
  return /^\d{3}-\d{3}$/.test(value);
}

export function formatDateTime(iso: string, locale = "tr-TR"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** PRD §38 — gecmis listesi tarih basliklariyla gruplanir. */
export function dayLabel(iso: string, locale = "tr-TR"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return locale.startsWith("tr") ? "Bugün" : "Today";
  if (sameDay(date, yesterday)) return locale.startsWith("tr") ? "Dün" : "Yesterday";
  return date.toLocaleDateString(locale, { day: "2-digit", month: "long", year: "numeric" });
}
