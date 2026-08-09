import { describe, expect, it } from "vitest";
import { applyRenameTemplate, matchRule, resolveTarget } from "./rules";
import { normalizeText, parseSize } from "./normalize";
import type { FileMeta, Folder, Rule } from "./types";

const folders: Folder[] = [
  { id: "f-root", name: "DSI", path: "D:\\DSI", parentId: null, isDefault: true },
  { id: "f-doc", name: "Belgeler", path: "D:\\DSI\\Belgeler", parentId: "f-root" },
  { id: "f-img", name: "Resimler", path: "D:\\DSI\\Resimler", parentId: "f-root" },
  { id: "f-big", name: "Buyuk", path: "D:\\DSI\\Buyuk", parentId: "f-root" },
];

function rule(partial: Partial<Rule> & Pick<Rule, "matchType" | "matchValue">): Rule {
  return {
    id: partial.id ?? "r-1",
    name: partial.name ?? "kural",
    priority: partial.priority ?? 100,
    enabled: partial.enabled ?? true,
    targetFolderId: partial.targetFolderId ?? "f-doc",
    rename: partial.rename ?? null,
    conflictPolicy: partial.conflictPolicy ?? "rename",
    matchType: partial.matchType,
    matchValue: partial.matchValue,
  };
}

function file(partial: Partial<FileMeta> = {}): FileMeta {
  // null degerlerin ezilmemesi icin `in` kontrolu kullanilir.
  return {
    fileName: partial.fileName ?? "rapor.pdf",
    sizeBytes: partial.sizeBytes ?? 1024,
    sourceApp: "sourceApp" in partial ? partial.sourceApp ?? null : "WhatsApp",
    mimeType: "mimeType" in partial ? partial.mimeType ?? null : "application/pdf",
    createdAt:
      "createdAt" in partial
        ? partial.createdAt ?? null
        : "2024-05-03T10:00:00.000Z",
    tags: partial.tags ?? [],
  };
}

describe("matchRule — extension", () => {
  it("*.pdf glob'u pdf dosyasiyla eslesir", () => {
    expect(matchRule(file({ fileName: "Fatura.PDF" }), rule({ matchType: "extension", matchValue: "*.pdf" }))).toBe(true);
  });

  it("*.pdf glob'u jpg dosyasiyla eslesmez", () => {
    expect(matchRule(file({ fileName: "foto.jpg" }), rule({ matchType: "extension", matchValue: "*.pdf" }))).toBe(false);
  });

  it("virgullu uzanti listesi OR olarak calisir", () => {
    const r = rule({ matchType: "extension", matchValue: "pdf, docx, xlsx" });
    expect(matchRule(file({ fileName: "sunum.docx" }), r)).toBe(true);
    expect(matchRule(file({ fileName: "video.mp4" }), r)).toBe(false);
  });

  it("uzantisiz dosya uzanti kuraliyla eslesmez", () => {
    expect(matchRule(file({ fileName: "LICENSE" }), rule({ matchType: "extension", matchValue: "pdf" }))).toBe(false);
  });

  it("ad+uzanti glob'u destekler (rapor*.xlsx)", () => {
    const r = rule({ matchType: "extension", matchValue: "rapor*.xlsx" });
    expect(matchRule(file({ fileName: "rapor-2024.xlsx" }), r)).toBe(true);
    expect(matchRule(file({ fileName: "butce-2024.xlsx" }), r)).toBe(false);
  });
});

describe("matchRule — filename", () => {
  it("buyuk/kucuk harf duyarsiz alt metin eslesmesi", () => {
    expect(matchRule(file({ fileName: "AYLIK_Fatura_05.pdf" }), rule({ matchType: "filename", matchValue: "fatura" }))).toBe(true);
  });

  it("Turkce karakterleri normalize eder", () => {
    expect(matchRule(file({ fileName: "ŞUBAT_Ödeme_Fişi.pdf" }), rule({ matchType: "filename", matchValue: "subat odeme" }))).toBe(false);
    expect(matchRule(file({ fileName: "ŞUBAT_Ödeme.pdf" }), rule({ matchType: "filename", matchValue: "odeme" }))).toBe(true);
    expect(matchRule(file({ fileName: "Iğdır-rapor.pdf" }), rule({ matchType: "filename", matchValue: "igdir" }))).toBe(true);
  });

  it("eslesmeyen metin false doner", () => {
    expect(matchRule(file({ fileName: "rapor.pdf" }), rule({ matchType: "filename", matchValue: "makbuz" }))).toBe(false);
  });
});

describe("matchRule — source / tag", () => {
  it("kaynak uygulama kismi olarak eslesir", () => {
    expect(matchRule(file({ sourceApp: "WhatsApp Business" }), rule({ matchType: "source", matchValue: "whatsapp" }))).toBe(true);
  });

  it("kaynak uygulama yoksa eslesmez", () => {
    expect(matchRule(file({ sourceApp: null }), rule({ matchType: "source", matchValue: "whatsapp" }))).toBe(false);
  });

  it("etiket eslesmesi normalize edilir", () => {
    expect(matchRule(file({ tags: ["Muhasebe", "Önemli"] }), rule({ matchType: "tag", matchValue: "onemli" }))).toBe(true);
    expect(matchRule(file({ tags: ["Muhasebe"] }), rule({ matchType: "tag", matchValue: "arsiv" }))).toBe(false);
  });
});

describe("matchRule — size", () => {
  it("'> 10MB' buyuk dosyayla eslesir", () => {
    const r = rule({ matchType: "size", matchValue: "> 10MB" });
    expect(matchRule(file({ sizeBytes: 20 * 1024 * 1024 }), r)).toBe(true);
    expect(matchRule(file({ sizeBytes: 5 * 1024 * 1024 }), r)).toBe(false);
  });

  it("'< 500KB' kucuk dosyayla eslesir", () => {
    const r = rule({ matchType: "size", matchValue: "< 500KB" });
    expect(matchRule(file({ sizeBytes: 100 * 1024 }), r)).toBe(true);
    expect(matchRule(file({ sizeBytes: 900 * 1024 }), r)).toBe(false);
  });

  it("aralik formati (10MB-20MB) calisir", () => {
    const r = rule({ matchType: "size", matchValue: "10MB-20MB" });
    expect(matchRule(file({ sizeBytes: 15 * 1024 * 1024 }), r)).toBe(true);
    expect(matchRule(file({ sizeBytes: 25 * 1024 * 1024 }), r)).toBe(false);
  });

  it("gecersiz boyut ifadesi eslesmez", () => {
    expect(matchRule(file({ sizeBytes: 999 }), rule({ matchType: "size", matchValue: "> cok" }))).toBe(false);
  });

  it("parseSize birimleri dogru cevirir", () => {
    expect(parseSize("1KB")).toBe(1024);
    expect(parseSize("1.5MB")).toBe(Math.round(1.5 * 1024 * 1024));
    expect(parseSize("512")).toBe(512);
    expect(parseSize("abc")).toBeNull();
  });
});

describe("matchRule — date", () => {
  it("tarih araligi icindeki dosya eslesir", () => {
    const r = rule({ matchType: "date", matchValue: "2024-05-01..2024-05-31" });
    expect(matchRule(file({ createdAt: "2024-05-03T10:00:00Z" }), r)).toBe(true);
    expect(matchRule(file({ createdAt: "2024-06-03T10:00:00Z" }), r)).toBe(false);
  });

  it("aralik bitis gunu dahildir", () => {
    const r = rule({ matchType: "date", matchValue: "2024-05-01..2024-05-03" });
    expect(matchRule(file({ createdAt: "2024-05-03T23:59:00Z" }), r)).toBe(true);
  });

  it("'>= tarih' karsilastirmasi calisir", () => {
    const r = rule({ matchType: "date", matchValue: ">= 2024-05-01" });
    expect(matchRule(file({ createdAt: "2024-07-01T00:00:00Z" }), r)).toBe(true);
    expect(matchRule(file({ createdAt: "2024-01-01T00:00:00Z" }), r)).toBe(false);
  });

  it("tarih bilgisi yoksa eslesmez", () => {
    expect(matchRule(file({ createdAt: null }), rule({ matchType: "date", matchValue: "2024-05-03" }))).toBe(false);
  });
});

describe("matchRule — genel", () => {
  it("devre disi kural asla eslesmez", () => {
    expect(matchRule(file({ fileName: "a.pdf" }), rule({ matchType: "extension", matchValue: "pdf", enabled: false }))).toBe(false);
  });

  it("bos matchValue eslesmez", () => {
    expect(matchRule(file(), rule({ matchType: "filename", matchValue: "   " }))).toBe(false);
  });
});

describe("applyRenameTemplate", () => {
  it("tum placeholder'lari doldurur", () => {
    const out = applyRenameTemplate("{date}_{source}_{orig}_{seq}.{ext}", file({ fileName: "fatura.pdf", sourceApp: "WhatsApp" }), { seq: 7 });
    expect(out).toBe("2024-05-03_whatsapp_fatura_007.pdf");
  });

  it("{ext} yoksa orijinal uzantiyi korur", () => {
    expect(applyRenameTemplate("{date}-{orig}", file({ fileName: "not.txt" }))).toBe("2024-05-03-not.txt");
  });

  it("gecersiz dosya sistemi karakterlerini temizler", () => {
    expect(applyRenameTemplate("a/b:c{orig}", file({ fileName: "x.pdf" }))).toBe("a_b_cx.pdf");
  });

  it("kaynak yoksa 'unknown' kullanir", () => {
    expect(applyRenameTemplate("{source}-{orig}.{ext}", file({ fileName: "a.png", sourceApp: null }))).toBe("unknown-a.png");
  });
});

describe("resolveTarget", () => {
  const rules: Rule[] = [
    rule({ id: "r-img", name: "resim", priority: 10, matchType: "extension", matchValue: "jpg, png", targetFolderId: "f-img" }),
    rule({ id: "r-big", name: "buyuk", priority: 20, matchType: "size", matchValue: "> 100MB", targetFolderId: "f-big", conflictPolicy: "version" }),
    rule({ id: "r-pdf", name: "pdf", priority: 30, matchType: "extension", matchValue: "pdf", targetFolderId: "f-doc", rename: "{date}_{orig}.{ext}" }),
  ];

  it("oncelik sirasina gore ilk eslesen kural kazanir", () => {
    const res = resolveTarget(file({ fileName: "tatil.jpg", sizeBytes: 200 * 1024 * 1024 }), rules, folders);
    expect(res.matchedRuleId).toBe("r-img");
    expect(res.folderId).toBe("f-img");
  });

  it("eslesen kuralin rename sablonunu uygular", () => {
    const res = resolveTarget(file({ fileName: "fatura.pdf" }), rules, folders);
    expect(res.matchedRuleId).toBe("r-pdf");
    expect(res.fileName).toBe("2024-05-03_fatura.pdf");
    expect(res.folderId).toBe("f-doc");
  });

  it("kural conflictPolicy'sini tasir", () => {
    const res = resolveTarget(file({ fileName: "yedek.zip", sizeBytes: 300 * 1024 * 1024 }), rules, folders);
    expect(res.matchedRuleId).toBe("r-big");
    expect(res.conflictPolicy).toBe("version");
  });

  it("hicbir kural eslesmezse varsayilan klasore duser", () => {
    const res = resolveTarget(file({ fileName: "notlar.md", sizeBytes: 10 }), rules, folders);
    expect(res.matchedRuleId).toBeNull();
    expect(res.folderId).toBe("f-root");
    expect(res.fileName).toBe("notlar.md");
  });

  it("options.defaultFolderId varsayilani ezer", () => {
    const res = resolveTarget(file({ fileName: "notlar.md" }), rules, folders, { defaultFolderId: "f-doc" });
    expect(res.folderId).toBe("f-doc");
  });

  it("devre disi kural atlanir, sonraki kural kazanir", () => {
    const disabled = rules.map((r) => (r.id === "r-img" ? { ...r, enabled: false } : r));
    const res = resolveTarget(file({ fileName: "tatil.jpg", sizeBytes: 200 * 1024 * 1024 }), disabled, folders);
    expect(res.matchedRuleId).toBe("r-big");
  });

  it("hedef klasoru silinmis kural atlanir", () => {
    const orphan = [rule({ id: "r-orphan", priority: 1, matchType: "extension", matchValue: "pdf", targetFolderId: "f-yok" }), ...rules];
    const res = resolveTarget(file({ fileName: "fatura.pdf" }), orphan, folders);
    expect(res.matchedRuleId).toBe("r-pdf");
  });

  it("kural listesi bos ise varsayilana duser", () => {
    const res = resolveTarget(file(), [], folders);
    expect(res.matchedRuleId).toBeNull();
    expect(res.folderId).toBe("f-root");
  });
});

describe("normalizeText", () => {
  it("Turkce karakterleri ASCII'ye indirger", () => {
    expect(normalizeText("İĞÜŞÖÇ ığüşöç")).toBe("igusoc igusoc");
  });
});
