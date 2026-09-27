import { beforeEach, describe, expect, it } from "vitest";

const SESSION_BACKUP_KEY = "phoneshare.device_session";

// vitest "node" ortaminda localStorage/indexedDB yok; localStorage yedegini
// test etmek icin en basit bellek-ici polyfill.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const { COOKIE_SESSION_TOKEN, DEFAULT_PREFERENCES, getSession, mergePreferences, setSession } = await import(
  "./session"
);

describe("mergePreferences", () => {
  it("varsayilan arayuz stili klasiktir", () => {
    expect(DEFAULT_PREFERENCES.mobileSkin).toBe("classic");
    expect(DEFAULT_PREFERENCES.desktopSkin).toBe("classic");
  });

  it("kayitli gecerli stiller korunur", () => {
    const merged = mergePreferences({ mobileSkin: "radar", desktopSkin: "command" });
    expect(merged.mobileSkin).toBe("radar");
    expect(merged.desktopSkin).toBe("command");
  });

  it("bilinmeyen stil degerleri klasige duser", () => {
    const merged = mergePreferences({
      mobileSkin: "kaldirilmis-stil" as never,
      desktopSkin: "yok" as never,
    });
    expect(merged.mobileSkin).toBe("classic");
    expect(merged.desktopSkin).toBe("classic");
  });

  it("stil disindaki tercihler bozulmaz", () => {
    const merged = mergePreferences({ quickSend: true, lastTargetId: "belgeler" });
    expect(merged.quickSend).toBe(true);
    expect(merged.lastTargetId).toBe("belgeler");
    expect(merged.language).toBe("en");
  });

  it("kayit yoksa varsayilanlar doner", () => {
    expect(mergePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("setSession localStorage yedegi", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("gercek cihaz token'ini localStorage yedegine yazmaz", async () => {
    await setSession({
      deviceId: "phone-1",
      deviceName: "iPhone",
      token: "super-secret-real-token",
      pairedAt: Date.now(),
    });

    const raw = localStorage.getItem(SESSION_BACKUP_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("super-secret-real-token");
    const parsed = JSON.parse(raw as string);
    expect(parsed.token).toBe(COOKIE_SESSION_TOKEN);
  });

  it("sentinel token'lar yedekte oldugu gibi kalir", async () => {
    await setSession({
      deviceId: "local-admin",
      deviceName: "This computer",
      token: COOKIE_SESSION_TOKEN,
      pairedAt: Date.now(),
    });

    const raw = localStorage.getItem(SESSION_BACKUP_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.token).toBe(COOKIE_SESSION_TOKEN);
  });

  it("getSession IndexedDB yoksa yedekten dondugunde token gercek degeri icermez", async () => {
    await setSession({
      deviceId: "phone-1",
      deviceName: "iPhone",
      token: "super-secret-real-token",
      pairedAt: Date.now(),
    });

    const restored = await getSession();
    expect(restored?.token).not.toBe("super-secret-real-token");
  });
});
