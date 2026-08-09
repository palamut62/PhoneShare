export interface PathValidationResult {
  ok: boolean;
  /** Normalize edilmis (ters bolu, tekil ayirici, sondaki ayirici atilmis) hali. */
  normalized: string;
  reason?: string;
}

const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

function fail(reason: string, normalized = ""): PathValidationResult {
  return { ok: false, normalized, reason };
}

/**
 * Klasor `path` alani icin guvenlik dogrulamasi.
 * - Sadece mutlak Windows surucu yolu ("D:\\DSI\\Belgeler") veya mutlak POSIX yolu ("/srv/depo")
 * - Path traversal ("..") yasak
 * - UNC ("\\\\sunucu\\pay") ve uzatilmis UNC ("\\\\?\\") yasak
 * - Gecersiz karakter, kontrol karakteri, NUL byte yasak
 * - Windows'ta ayrilmis cihaz adlari (CON, NUL, COM1...) yasak
 */
export function validateFolderPath(input: string): PathValidationResult {
  if (typeof input !== "string") return fail("Yol bir metin olmalidir.");

  const raw = input.trim();
  if (raw.length === 0) return fail("Yol bos olamaz.");
  if (raw.length > 400) return fail("Yol cok uzun (maks. 400 karakter).");

  // NUL ve diger kontrol karakterleri
  if (/[\u0000-\u001f]/.test(raw)) {
    return fail("Yol kontrol karakteri iceremez.");
  }

  // UNC ve uzatilmis yol onekleri
  if (/^[\\/]{2}/.test(raw)) {
    return fail("Ag paylasimi (UNC) yollari desteklenmiyor.");
  }
  if (raw.startsWith("\\\\?\\") || raw.startsWith("\\\\.\\")) {
    return fail("Uzatilmis cihaz yollari desteklenmiyor.");
  }

  const isWindows = /^[a-zA-Z]:[\\/]/.test(raw);
  const isPosix = raw.startsWith("/");
  if (!isWindows && !isPosix) {
    return fail(
      "Yol mutlak olmalidir (orn. D:\\DSI\\Belgeler veya /srv/depo).",
    );
  }

  const sep = isWindows ? "\\" : "/";
  const unified = raw.replace(/[\\/]+/g, "\u0001");
  const parts = unified.split("\u0001");

  const head = isWindows ? (parts.shift() as string) : "";
  if (isPosix) parts.shift(); // bas taraftaki bos parca

  const segments: string[] = [];
  for (const seg of parts) {
    if (seg === "") continue;
    if (seg === "." ) return fail("Yol '.' segmenti iceremez.");
    if (seg === "..") return fail("Yol '..' (ust dizin) iceremez.");
    if (isWindows && /[<>:"|?*]/.test(seg)) {
      return fail(`Gecersiz karakter iceren segment: ${seg}`);
    }
    if (isWindows && RESERVED_WINDOWS_NAMES.has(seg.toLowerCase().split(".")[0] as string)) {
      return fail(`Ayrilmis Windows adi kullanilamaz: ${seg}`);
    }
    if (isWindows && /[. ]$/.test(seg)) {
      return fail("Segment nokta veya bosluk ile bitemez.");
    }
    segments.push(seg);
  }

  const drive = head.slice(0, 2).toUpperCase();
  const normalized = isWindows
    ? segments.length === 0
      ? `${drive}${sep}`
      : `${drive}${sep}${segments.join(sep)}`
    : `/${segments.join("/")}`;

  return { ok: true, normalized };
}

/** Tek bir dosya adi guvenli mi (ayirici, traversal ve gecersiz karakter icermemeli). */
export function isSafeFileName(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (/[\\/]/.test(name)) return false;
  if (name === "." || name === "..") return false;
  if (/[\u0000-\u001f<>:"|?*]/.test(name)) return false;
  if (RESERVED_WINDOWS_NAMES.has((name.toLowerCase().split(".")[0] as string))) {
    return false;
  }
  return true;
}
