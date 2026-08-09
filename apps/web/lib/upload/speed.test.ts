import { describe, expect, it } from "vitest";

import { SpeedMeter, formatBytes, formatEta, formatSpeed } from "./speed";

describe("hiz ve ETA", () => {
  it("olcum yokken hiz bilinmez", () => {
    expect(new SpeedMeter().bytesPerSecond(0)).toBeNull();
  });

  it("gonderilen baytlardan hiz hesaplar", () => {
    const meter = new SpeedMeter(10_000);
    meter.record(1_000_000, 0);
    meter.record(1_000_000, 1000);
    expect(meter.bytesPerSecond(1000)).toBe(2_000_000);
  });

  it("kalan sureyi hizdan turetir", () => {
    const meter = new SpeedMeter(10_000);
    meter.record(1_000_000, 0);
    meter.record(1_000_000, 1000);
    expect(meter.etaSeconds(4_000_000, 1000)).toBeCloseTo(2, 5);
  });

  it("kalan bayt yoksa ETA sifirdir", () => {
    expect(new SpeedMeter().etaSeconds(0, 0)).toBe(0);
  });

  it("pencere disindaki eski olcumleri atar", () => {
    const meter = new SpeedMeter(1000);
    meter.record(10_000_000, 0);
    meter.record(1000, 5000);
    expect(meter.bytesPerSecond(5000)).toBeLessThan(10_000_000);
  });

  it("bayt bicimlendirme okunabilir", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024, "en-US")).toBe("1.0 KB");
    expect(formatBytes(12_582_912, "en-US")).toBe("12.0 MB");
  });

  it("hiz ve sure bicimlendirme bilinmeyeni gosterir", () => {
    expect(formatSpeed(null)).toBe("—");
    expect(formatEta(null)).toBe("—");
    expect(formatEta(45)).toBe("45 sn");
    expect(formatEta(125)).toBe("2 dk 5 sn");
  });
});
