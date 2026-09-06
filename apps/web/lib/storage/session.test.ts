import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, mergePreferences } from "./session";

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
