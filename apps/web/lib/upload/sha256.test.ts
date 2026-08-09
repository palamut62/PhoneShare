import { describe, expect, it, vi } from "vitest";

import { IncrementalSha256, hashFile, sha256Hex } from "./sha256";
import { FakeFile, makeBytes } from "./test-utils";

const encoder = new TextEncoder();

/** Bilinen NIST vektorleri. */
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("artimli SHA-256", () => {
  it("bilinen vektor: 'abc'", () => {
    expect(sha256Hex(encoder.encode("abc"))).toBe(ABC);
  });

  it("bilinen vektor: bos girdi", () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(EMPTY);
  });

  it("parca parca beslendiginde ayni sonucu verir", () => {
    const hasher = new IncrementalSha256();
    hasher.update(encoder.encode("a"));
    hasher.update(encoder.encode("b"));
    hasher.update(encoder.encode("c"));
    expect(hasher.digestHex()).toBe(ABC);
  });

  it("finalize sonrasi update reddedilir", () => {
    const hasher = new IncrementalSha256();
    hasher.digestHex();
    expect(() => hasher.update(encoder.encode("x"))).toThrow("sha256_already_finalized");
  });

  it("hashFile dosyayi bloklar halinde okur ve dogru hash uretir", async () => {
    const file = new FakeFile("abc.txt", encoder.encode("abc"));
    expect(await hashFile(file, { readSize: 1 })).toBe(ABC);
  });

  it("hashFile tum dosyayi tek seferde bellege almaz", async () => {
    const bytes = makeBytes(1000);
    const file = new FakeFile("big.bin", bytes);
    const slice = vi.spyOn(file, "slice");
    const digest = await hashFile(file, { readSize: 100 });
    expect(slice).toHaveBeenCalledTimes(10);
    expect(digest).toBe(sha256Hex(bytes));
  });

  it("hashFile ilerleme bildirir", async () => {
    const file = new FakeFile("a.bin", makeBytes(10));
    const progress: number[] = [];
    await hashFile(file, { readSize: 4, onProgress: (read) => progress.push(read) });
    expect(progress).toEqual([4, 8, 10]);
  });

  it("hashFile iptal edilebilir", async () => {
    const controller = new AbortController();
    controller.abort();
    const file = new FakeFile("a.bin", makeBytes(10));
    await expect(hashFile(file, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
