/** NFKD sonrasi kalan birlestirici aksan isaretleri. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

const TR_MAP: Record<string, string> = {
  İ: "i",
  I: "i",
  ı: "i",
  Ş: "s",
  ş: "s",
  Ğ: "g",
  ğ: "g",
  Ü: "u",
  ü: "u",
  Ö: "o",
  ö: "o",
  Ç: "c",
  ç: "c",
};

/**
 * Turkce karakterleri ASCII karsiligina indirger ve kucuk harfe cevirir.
 * "Belge Şubat" ve "belge subat" ayni kabul edilsin diye kural motorunda kullanilir.
 */
export function normalizeText(input: string): string {
  let out = "";
  for (const ch of input) {
    out += TR_MAP[ch] ?? ch;
  }
  return out
    .toLowerCase()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "");
}

/** "report.final.PDF" -> "pdf"; uzantisiz dosyada "" doner. */
export function getExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).toLowerCase();
}

/** "report.final.PDF" -> "report.final" */
export function getBaseName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return base;
  return base.slice(0, idx);
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 ** 2,
  gb: 1024 ** 3,
  tb: 1024 ** 4,
};

/** "10MB", "1.5 gb", "512" (byte) -> byte sayisi. Gecersizse null. */
export function parseSize(input: string): number | null {
  const m = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(b|kb|mb|gb|tb)?\s*$/i.exec(input);
  if (!m) return null;
  const num = Number.parseFloat((m[1] as string).replace(",", "."));
  if (!Number.isFinite(num)) return null;
  const unit = (m[2] ?? "b").toLowerCase();
  const factor = SIZE_UNITS[unit];
  if (factor === undefined) return null;
  return Math.round(num * factor);
}

/** Tarih girdisini gun hassasiyetinde UTC epoch ms'e cevirir. */
export function parseDate(input: string | Date | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  const t = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed,
  );
  return Number.isNaN(t) ? null : t;
}

/** Virgul/noktali virgul ile ayrilmis listeyi bos olmayan parcalara boler. */
export function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** `*` ve `?` destekleyen basit glob -> RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i");
}
