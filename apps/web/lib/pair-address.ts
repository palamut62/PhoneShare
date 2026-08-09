/**
 * Eslestirme adresi yardimcilari (PRD §12/§47/§48).
 *
 * Adresler receiver'dan gelir (`/api/pair` -> `addresses`). Masaustu kabugu
 * Tailscale modundaysa scheme/host/PORT birlikte degistirilir; port atlanirsa
 * telefon eski porta baglanmaya calisir ve eslestirme sessizce basarisiz olur.
 */

import type { ReceiverAddress } from "@phoneshare/shared-types";

import type { PairAddress } from "@/lib/tauri";

export function applyAddressOverride(url: string, override: PairAddress | null): string {
  if (!url || !override) return url;
  try {
    const u = new URL(url);
    u.protocol = `${override.scheme}:`;
    u.hostname = override.host;
    u.port = override.port ? String(override.port) : "";
    return u.toString();
  } catch {
    return url;
  }
}

/** Telefonun erisebilecegi ilk aday; yoksa listenin ilki (loopback). */
export function preferredAddress(addresses: ReceiverAddress[]): ReceiverAddress | null {
  return addresses.find((item) => item.reachable_from_phone) ?? addresses[0] ?? null;
}
