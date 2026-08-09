import { describe, expect, it } from "vitest";

import { buildChunkRanges, bytesFromChunks, pendingChunks, totalChunkCount } from "./chunk";

describe("chunk bolme", () => {
  it("dosyayi esit parcalara boler ve son parca kucuk kalir", () => {
    const ranges = buildChunkRanges(10, 4);
    expect(ranges).toEqual([
      { index: 0, start: 0, end: 4, size: 4 },
      { index: 1, start: 4, end: 8, size: 4 },
      { index: 2, start: 8, end: 10, size: 2 },
    ]);
  });

  it("tam bolunen boyutta fazladan parca uretmez", () => {
    expect(buildChunkRanges(8, 4)).toHaveLength(2);
  });

  it("son parca haric tum parcalar tam chunk_size boyutundadir", () => {
    const ranges = buildChunkRanges(8_388_608 * 2 + 5, 8_388_608);
    expect(ranges.slice(0, -1).every((range) => range.size === 8_388_608)).toBe(true);
    expect(ranges.at(-1)?.size).toBe(5);
  });

  it("bos dosya icin tek bos parca doner", () => {
    expect(buildChunkRanges(0, 4)).toEqual([{ index: 0, start: 0, end: 0, size: 0 }]);
  });

  it("gecersiz chunk boyutunda hata firlatir", () => {
    expect(() => buildChunkRanges(10, 0)).toThrow("invalid_chunk_size");
  });

  it("totalChunkCount yukari yuvarlar", () => {
    expect(totalChunkCount(10, 4)).toBe(3);
    expect(totalChunkCount(0, 4)).toBe(1);
  });

  it("resume: existing_chunks icindeki parcalari atlar", () => {
    const ranges = buildChunkRanges(10, 4);
    expect(pendingChunks(ranges, [0, 2]).map((range) => range.index)).toEqual([1]);
  });

  it("resume: atlanan baytlari dogru toplar", () => {
    const ranges = buildChunkRanges(10, 4);
    expect(bytesFromChunks(ranges, [0, 2])).toBe(6);
  });
});
