import { describe, expect, it } from "vitest";
import { isSafeFileName, validateFolderPath } from "./path";

describe("validateFolderPath", () => {
  it("gecerli Windows yolunu kabul eder ve normalize eder", () => {
    const r = validateFolderPath("d:\\DSI\\Belgeler\\");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("D:\\DSI\\Belgeler");
  });

  it("ileri bolu ile yazilmis Windows yolunu normalize eder", () => {
    expect(validateFolderPath("D:/DSI//Resimler").normalized).toBe("D:\\DSI\\Resimler");
  });

  it("gecerli POSIX yolunu kabul eder", () => {
    const r = validateFolderPath("/srv/depo/belgeler/");
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe("/srv/depo/belgeler");
  });

  it("path traversal (..) reddeder", () => {
    expect(validateFolderPath("D:\\DSI\\..\\Windows").ok).toBe(false);
    expect(validateFolderPath("/srv/../etc").ok).toBe(false);
  });

  it("UNC yollarini reddeder", () => {
    expect(validateFolderPath("\\\\sunucu\\paylasim").ok).toBe(false);
    expect(validateFolderPath("//sunucu/paylasim").ok).toBe(false);
  });

  it("goreli yolu reddeder", () => {
    expect(validateFolderPath("DSI\\Belgeler").ok).toBe(false);
    expect(validateFolderPath("./belgeler").ok).toBe(false);
  });

  it("bos yolu reddeder", () => {
    expect(validateFolderPath("   ").ok).toBe(false);
  });

  it("kontrol karakteri / NUL iceren yolu reddeder", () => {
    expect(validateFolderPath("D:\\DSI\\a\u0000b").ok).toBe(false);
  });

  it("gecersiz Windows karakterlerini reddeder", () => {
    expect(validateFolderPath('D:\\DSI\\a|b').ok).toBe(false);
    expect(validateFolderPath('D:\\DSI\\a?b').ok).toBe(false);
  });

  it("ayrilmis Windows adlarini reddeder", () => {
    expect(validateFolderPath("D:\\DSI\\CON").ok).toBe(false);
    expect(validateFolderPath("D:\\DSI\\nul").ok).toBe(false);
  });

  it("cok uzun yolu reddeder", () => {
    expect(validateFolderPath(`D:\\${"a".repeat(500)}`).ok).toBe(false);
  });

  it("surucu kokunu kabul eder", () => {
    expect(validateFolderPath("D:\\").normalized).toBe("D:\\");
  });
});

describe("isSafeFileName", () => {
  it("normal dosya adini kabul eder", () => {
    expect(isSafeFileName("2024-05-03_fatura.pdf")).toBe(true);
  });

  it("ayirici veya traversal iceren adi reddeder", () => {
    expect(isSafeFileName("..")).toBe(false);
    expect(isSafeFileName("a/b.pdf")).toBe(false);
    expect(isSafeFileName("a\\b.pdf")).toBe(false);
  });

  it("ayrilmis adi reddeder", () => {
    expect(isSafeFileName("COM1.txt")).toBe(false);
  });
});
