import type {
  ConflictPolicy,
  FileMeta,
  Folder,
  ResolvedTarget,
  Rule,
} from "./types";
import {
  getBaseName,
  getExtension,
  globToRegExp,
  normalizeText,
  parseDate,
  parseSize,
  splitList,
} from "./normalize";

/* ------------------------------------------------------------------ */
/* Tekil eslesticiler                                                  */
/* ------------------------------------------------------------------ */

/**
 * "*.pdf", "pdf", ".PDF", "*.doc?" veya "pdf, docx" formatlarini destekler.
 * Bosluklu liste icindeki her parca ayri ayri denenir (OR).
 */
function matchExtension(file: FileMeta, value: string): boolean {
  const ext = getExtension(file.fileName);
  if (!ext) return false;
  const fileName = file.fileName.split(/[\\/]/).pop() ?? file.fileName;
  return splitList(value).some((raw) => {
    const pattern = raw.trim();
    if (!pattern) return false;
    // Tam glob verilmisse dosya adinin tamamiyla karsilastir: "*.pdf", "rapor*.xlsx"
    if (pattern.includes("*") || pattern.includes("?")) {
      return globToRegExp(pattern).test(fileName);
    }
    // Sade uzanti verilmisse: "pdf" veya ".pdf"
    return pattern.replace(/^\./, "").toLowerCase() === ext;
  });
}

/** Dosya adi icinde gecen metin; buyuk/kucuk harf ve Turkce karakter duyarsiz. */
function matchFilename(file: FileMeta, value: string): boolean {
  const haystack = normalizeText(file.fileName);
  return splitList(value).some((raw) => {
    const needle = normalizeText(raw);
    if (!needle) return false;
    if (needle.includes("*") || needle.includes("?")) {
      return globToRegExp(needle).test(haystack);
    }
    return haystack.includes(needle);
  });
}

/** Kaynak uygulama adi (WhatsApp, Safari, Mail...). Kismi eslesme kabul edilir. */
function matchSource(file: FileMeta, value: string): boolean {
  if (!file.sourceApp) return false;
  const haystack = normalizeText(file.sourceApp);
  return splitList(value).some((raw) => {
    const needle = normalizeText(raw);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * "> 10MB", ">=1gb", "< 500KB", "= 1024", "10MB-20MB" formatlari.
 */
function matchSize(file: FileMeta, value: string): boolean {
  const raw = value.trim();
  const range = /^([^-]+)-(.+)$/.exec(raw);
  if (range && !/^[<>=]/.test(raw)) {
    const min = parseSize(range[1] as string);
    const max = parseSize(range[2] as string);
    if (min === null || max === null) return false;
    return file.sizeBytes >= min && file.sizeBytes <= max;
  }
  const m = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(raw);
  if (!m) return false;
  const op = m[1] ?? "=";
  const bytes = parseSize(m[2] as string);
  if (bytes === null) return false;
  switch (op) {
    case ">":
      return file.sizeBytes > bytes;
    case ">=":
      return file.sizeBytes >= bytes;
    case "<":
      return file.sizeBytes < bytes;
    case "<=":
      return file.sizeBytes <= bytes;
    default:
      return file.sizeBytes === bytes;
  }
}

/**
 * "2024-01-01..2024-12-31" araligi, ">= 2024-01-01", "<= 2024-12-31"
 * veya tek gun "2024-05-03" (o gunun tamami).
 */
function matchDate(file: FileMeta, value: string): boolean {
  const at = parseDate(file.createdAt ?? null);
  if (at === null) return false;
  const raw = value.trim();

  const range = raw.split("..");
  if (range.length === 2) {
    const from = parseDate((range[0] as string).trim());
    const to = parseDate((range[1] as string).trim());
    if (from === null || to === null) return false;
    // Bitis gunu dahil olsun diye gun sonuna tasinir.
    return at >= from && at <= to + DAY_MS - 1;
  }

  const m = /^(>=|<=|>|<)\s*(.+)$/.exec(raw);
  if (m) {
    const bound = parseDate((m[2] as string).trim());
    if (bound === null) return false;
    switch (m[1]) {
      case ">":
        return at > bound;
      case ">=":
        return at >= bound;
      case "<":
        return at < bound;
      default:
        return at <= bound + DAY_MS - 1;
    }
  }

  const day = parseDate(raw);
  if (day === null) return false;
  return at >= day && at < day + DAY_MS;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Etiketlerden herhangi biri eslesirse true. */
function matchTag(file: FileMeta, value: string): boolean {
  const tags = (file.tags ?? []).map(normalizeText);
  if (tags.length === 0) return false;
  return splitList(value).some((raw) => tags.includes(normalizeText(raw)));
}

/* ------------------------------------------------------------------ */
/* Genel API                                                           */
/* ------------------------------------------------------------------ */

/** Tek bir kuralin dosyaya uyup uymadigini soyler. Devre disi kural asla eslesmez. */
export function matchRule(file: FileMeta, rule: Rule): boolean {
  if (!rule.enabled) return false;
  if (!rule.matchValue || rule.matchValue.trim() === "") return false;
  switch (rule.matchType) {
    case "extension":
      return matchExtension(file, rule.matchValue);
    case "filename":
      return matchFilename(file, rule.matchValue);
    case "source":
      return matchSource(file, rule.matchValue);
    case "size":
      return matchSize(file, rule.matchValue);
    case "date":
      return matchDate(file, rule.matchValue);
    case "tag":
      return matchTag(file, rule.matchValue);
    default:
      return false;
  }
}

function pad(n: number, len: number): string {
  return String(n).padStart(len, "0");
}

/** Dosya sistemi icin guvenli olmayan karakterleri temizler. */
function sanitizeSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

export interface RenameContext {
  /** {seq} icin sira numarasi (varsayilan 1). */
  seq?: number;
  /** {seq} icin basamak sayisi (varsayilan 3 -> 001). */
  seqPadding?: number;
}

/**
 * Yeniden adlandirma sablonu: {date} {source} {orig} {ext} {seq}
 * Ornek: "{date}_{source}_{orig}.{ext}" -> "2024-05-03_whatsapp_fatura.pdf"
 */
export function applyRenameTemplate(
  template: string,
  file: FileMeta,
  ctx: RenameContext = {},
): string {
  const at = parseDate(file.createdAt ?? null) ?? Date.now();
  const d = new Date(at);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
  const ext = getExtension(file.fileName);
  const orig = getBaseName(file.fileName);
  const source = file.sourceApp ? normalizeText(file.sourceApp) : "unknown";
  const seq = pad(ctx.seq ?? 1, ctx.seqPadding ?? 3);

  const values: Record<string, string> = { date, source, orig, ext, seq };

  let out = template.replace(/\{(date|source|orig|ext|seq)\}/gi, (_m, key: string) => {
    return values[key.toLowerCase()] ?? "";
  });

  // Sablonda {ext} yoksa orijinal uzantiyi koru.
  if (ext && !/\{ext\}/i.test(template) && !out.toLowerCase().endsWith(`.${ext}`)) {
    out = `${out}.${ext}`;
  }
  // Uzanti bos kaldiysa olusan sondaki noktayi temizle.
  out = out.replace(/\.+$/, "");

  const sanitized = sanitizeSegment(out);
  return sanitized.length > 0 ? sanitized : file.fileName;
}

export interface ResolveOptions {
  /** Hicbir kural eslesmezse kullanilacak klasor id'si (folders icindeki isDefault'u ezer). */
  defaultFolderId?: string | null;
  /** Hicbir kural eslesmediginde uygulanacak politika. */
  defaultConflictPolicy?: ConflictPolicy;
  rename?: RenameContext;
}

/** Kurallari oncelik (kucuk once), sonra id'ye gore deterministik siralar. */
export function sortRules(rules: readonly Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Oncelik sirasina gore ILK eslesen kural kazanir.
 * Hicbiri eslesmezse varsayilan klasore (isDefault ya da options.defaultFolderId) duser.
 */
export function resolveTarget(
  file: FileMeta,
  rules: readonly Rule[],
  folders: readonly Folder[],
  options: ResolveOptions = {},
): ResolvedTarget {
  const folderIds = new Set(folders.map((f) => f.id));

  for (const rule of sortRules(rules)) {
    if (!matchRule(file, rule)) continue;
    // Hedef klasor silinmisse kural gecersiz sayilir, sonraki kurala bakilir.
    if (folders.length > 0 && !folderIds.has(rule.targetFolderId)) continue;
    return {
      folderId: rule.targetFolderId,
      fileName: rule.rename
        ? applyRenameTemplate(rule.rename, file, options.rename)
        : file.fileName,
      conflictPolicy: rule.conflictPolicy,
      matchedRuleId: rule.id,
    };
  }

  const fallback =
    options.defaultFolderId ??
    folders.find((f) => f.isDefault)?.id ??
    folders.find((f) => f.parentId === null)?.id ??
    null;

  return {
    folderId: fallback,
    fileName: file.fileName,
    conflictPolicy: options.defaultConflictPolicy ?? "rename",
    matchedRuleId: null,
  };
}
