/**
 * Chunk hesaplari (PRD §27, §28).
 * Son parca haric her parca tam `chunkSize` boyutunda olmalidir (docs/api.md).
 */

export interface ChunkRange {
  index: number;
  start: number;
  end: number;
  size: number;
}

export function totalChunkCount(size: number, chunkSize: number): number {
  if (chunkSize <= 0) throw new Error("invalid_chunk_size");
  if (size <= 0) return 1;
  return Math.ceil(size / chunkSize);
}

/** Dosyayi `chunkSize` araliklarina boler. Bos dosya icin tek bos parca doner. */
export function buildChunkRanges(size: number, chunkSize: number): ChunkRange[] {
  if (chunkSize <= 0) throw new Error("invalid_chunk_size");
  if (size < 0) throw new Error("invalid_size");
  if (size === 0) return [{ index: 0, start: 0, end: 0, size: 0 }];

  const ranges: ChunkRange[] = [];
  for (let index = 0; index * chunkSize < size; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, size);
    ranges.push({ index, start, end, size: end - start });
  }
  return ranges;
}

/** Sunucudaki mevcut parcalari atlar (resume, PRD §28). */
export function pendingChunks(ranges: ChunkRange[], existingChunks: readonly number[]): ChunkRange[] {
  const existing = new Set(existingChunks);
  return ranges.filter((range) => !existing.has(range.index));
}

/** Resume ile atlanan bayt miktari. */
export function bytesFromChunks(
  ranges: ChunkRange[],
  chunkIndexes: readonly number[],
): number {
  const wanted = new Set(chunkIndexes);
  return ranges.reduce((total, range) => (wanted.has(range.index) ? total + range.size : total), 0);
}
