import { describe, expect, it } from "vitest";

import { isLocalPanel, resolveShellView } from "./panel";

describe("isLocalPanel", () => {
  it("tauri kabugu her zaman yerel paneldir", () => {
    expect(isLocalPanel({ isTauriShell: true, isLocalClient: false })).toBe(true);
  });

  it("tarayicida da loopback istemci yerel paneldir", () => {
    expect(isLocalPanel({ isTauriShell: false, isLocalClient: true })).toBe(true);
  });

  it("telefon (LAN) yerel panel degildir", () => {
    expect(isLocalPanel({ isTauriShell: false, isLocalClient: false })).toBe(false);
  });
});

describe("resolveShellView", () => {
  const base = { ready: true, hasSession: false, isTauriShell: false, isLocalClient: false };

  it("hazir degilken yukleniyor", () => {
    expect(resolveShellView({ ...base, ready: false })).toBe("loading");
  });

  it("oturum yok + is_local_client:true -> 'Yeni Telefon Ekle' ekrani", () => {
    expect(resolveShellView({ ...base, isLocalClient: true })).toBe("local-panel");
  });

  it("oturum yok + is_local_client:false -> kod girme ekrani", () => {
    expect(resolveShellView(base)).toBe("pairing");
  });

  it("oturum varsa her zaman uygulama", () => {
    expect(resolveShellView({ ...base, hasSession: true, isLocalClient: true })).toBe("app");
    expect(resolveShellView({ ...base, hasSession: true })).toBe("app");
  });
});
