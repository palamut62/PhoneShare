/**
 * Artimli SHA-256 (PRD §29).
 *
 * WebCrypto `crypto.subtle.digest` tum dosyayi bellege almak zorunda birakir; 1 GB+
 * dosyalarda mobil Safari coker. Bu yuzden `@noble/hashes` ile parca parca hash alinir.
 */

import { sha256 } from "@noble/hashes/sha256";
import type { FileLike } from "./types";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/** Artimli hash biriktirici. */
export class IncrementalSha256 {
  private hasher = sha256.create();
  private finished = false;

  update(chunk: Uint8Array): this {
    if (this.finished) throw new Error("sha256_already_finalized");
    this.hasher.update(chunk);
    return this;
  }

  digestHex(): string {
    this.finished = true;
    return toHex(this.hasher.digest());
  }
}

/** Tek seferlik yardimci (kucuk veriler ve testler icin). */
export function sha256Hex(data: Uint8Array): string {
  return toHex(sha256(data));
}

export interface HashFileOptions {
  /** Okuma penceresi (bayt). Varsayilan 4 MB. */
  readSize?: number;
  onProgress?: (readBytes: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

/**
 * Dosyayi `readSize` bloklariyla okuyup SHA-256 hex dondurur.
 * Dosyanin tamami hicbir zaman bellekte tutulmaz.
 */
export async function hashFile(file: FileLike, options: HashFileOptions = {}): Promise<string> {
  const readSize = options.readSize && options.readSize > 0 ? options.readSize : 4 * 1024 * 1024;
  const hasher = new IncrementalSha256();
  let offset = 0;

  while (offset < file.size) {
    if (options.signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    const end = Math.min(offset + readSize, file.size);
    const buffer = await file.slice(offset, end).arrayBuffer();
    hasher.update(new Uint8Array(buffer));
    offset = end;
    options.onProgress?.(offset, file.size);
  }

  return hasher.digestHex();
}
