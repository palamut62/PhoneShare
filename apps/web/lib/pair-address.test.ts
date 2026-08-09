import { describe, expect, it } from "vitest";

import { applyAddressOverride, preferredAddress } from "@/lib/pair-address";

const address = (
  kind: "lan" | "tailscale" | "loopback",
  url: string,
  reachable: boolean,
) => ({ url, host: new URL(url).hostname, kind, reachable_from_phone: reachable, label: kind });

describe("applyAddressOverride (PRD §12/§48)", () => {
  it("override yoksa adresi degistirmez", () => {
    const url = "http://192.168.1.180:8765/?pair=482-193";
    expect(applyAddressOverride(url, null)).toBe(url);
  });

  it("scheme, host VE portu birlikte degistirir", () => {
    const result = applyAddressOverride("http://192.168.1.180:8765/?pair=482-193", {
      scheme: "https",
      host: "umut-pc.tail1.ts.net",
      port: 8765,
    });
    expect(result).toBe("https://umut-pc.tail1.ts.net:8765/?pair=482-193");
  });

  it("varsayilan port (443) verilmezse URL'de port kalmaz", () => {
    const result = applyAddressOverride("http://192.168.1.180:8765/?pair=482-193", {
      scheme: "https",
      host: "umut-pc.tail1.ts.net",
      port: null,
    });
    expect(result).toBe("https://umut-pc.tail1.ts.net/?pair=482-193");
    expect(result).not.toContain("8765");
  });

  it("bozuk URL'de girdi korunur", () => {
    expect(applyAddressOverride("bozuk", { scheme: "http", host: "x" })).toBe("bozuk");
  });
});

describe("preferredAddress", () => {
  it("telefonun erisebilecegi ilk adayi secer", () => {
    const list = [
      address("loopback", "http://127.0.0.1:8765/", false),
      address("lan", "http://192.168.1.180:8765/", true),
    ];
    expect(preferredAddress(list)?.kind).toBe("lan");
  });

  it("hicbiri erisilebilir degilse ilk adayi doner", () => {
    const list = [address("loopback", "http://127.0.0.1:8765/", false)];
    expect(preferredAddress(list)?.kind).toBe("loopback");
  });

  it("liste bossa null doner", () => {
    expect(preferredAddress([])).toBeNull();
  });
});
