/**
 * Chunk'li dosya yukleme istemcisi (PRD §27-§30, §58-§60).
 *
 * - Dosya `Blob.slice` ile parcalanir, tamami bellege alinmaz.
 * - `existing_chunks` icindeki parcalar atlanir (resume, PRD §28).
 * - SHA-256 artimli hesaplanir ve `complete` asamasinda sunucu tarafindan dogrulanir.
 */

import { API_ROUTES } from "@phoneshare/shared-types";
import type { UploadCompleteResponse, UploadInitResponse } from "@phoneshare/shared-types";

import { buildChunkRanges, bytesFromChunks, pendingChunks, type ChunkRange } from "./chunk";
import { UploadError } from "./errors";
import { postBinary, postJson, del, type HttpContext } from "./http";
import { withRetry, isAbort, abortError, type RetryOptions } from "./retry";
import { hashFile, sha256Hex } from "./sha256";
import { SpeedMeter } from "./speed";
import type { FetchLike, FileLike, TransferStatus, UploadProgress } from "./types";

export interface UploadFileOptions {
  file: FileLike;
  targetId: string | null;
  fetch: FetchLike;
  token?: string | null;
  signal?: AbortSignal;
  /** Es zamanli parca sayisi (varsayilan 3). */
  concurrency?: number;
  retry?: RetryOptions;
  /** PRD §52 — istemci tarafi on kontrol; sunucu yine de dogrular. */
  maxFileBytes?: number;
  /** Hash okuma penceresi (bayt). */
  hashReadSize?: number;
  /** Her parca icin `chunk_hash` gonder (varsayilan true). */
  sendChunkHash?: boolean;
  now?: () => number;
  onProgress?: (progress: UploadProgress) => void;
  onStatus?: (status: TransferStatus) => void;
  onInit?: (init: UploadInitResponse) => void;
}

export interface UploadResult {
  uploadId: string;
  transferId: string;
  status: TransferStatus;
  verified: boolean;
  storedFilename: string | null;
  sha256: string | null;
  size: number;
}

export async function uploadFile(options: UploadFileOptions): Promise<UploadResult> {
  const {
    file,
    targetId,
    signal,
    concurrency = 3,
    maxFileBytes,
    hashReadSize,
    sendChunkHash = true,
    now = () => Date.now(),
    onProgress,
    onStatus,
    onInit,
  } = options;

  const ctx: HttpContext = { fetch: options.fetch, token: options.token ?? null, signal };
  const meter = new SpeedMeter();

  const emitStatus = (status: TransferStatus) => onStatus?.(status);
  const throwIfAborted = () => {
    if (signal?.aborted) throw new UploadError("cancelled");
  };

  // PRD §52 — gereksiz hash/ag trafigi olmadan erken uyari.
  if (typeof maxFileBytes === "number" && file.size > maxFileBytes) {
    emitStatus("FAILED");
    throw new UploadError("too_large");
  }

  emitStatus("PREPARING");
  throwIfAborted();

  let sha256: string;
  try {
    sha256 = await hashFile(file, { readSize: hashReadSize, signal });
  } catch (error) {
    if (isAbort(error)) throw new UploadError("cancelled");
    throw error;
  }

  throwIfAborted();

  const init = await withRetry(
    () =>
      postJson<UploadInitResponse>(ctx, API_ROUTES.uploadInit, {
        filename: file.name,
        size: file.size,
        mime_type: file.type || null,
        target_id: targetId,
        sha256,
      }),
    options.retry,
  );
  onInit?.(init);

  const ranges = buildChunkRanges(file.size, init.chunk_size);
  const totalChunks = ranges.length;
  let uploadedBytes = bytesFromChunks(ranges, init.existing_chunks);
  let chunksDone = init.existing_chunks.filter((index) => index < totalChunks).length;

  const report = () => {
    onProgress?.({
      uploadedBytes,
      totalBytes: file.size,
      percent: file.size === 0 ? 100 : Math.min(100, (uploadedBytes / file.size) * 100),
      bytesPerSecond: meter.bytesPerSecond(now()),
      etaSeconds: meter.etaSeconds(file.size - uploadedBytes, now()),
      chunksDone,
      totalChunks,
    });
  };

  emitStatus("UPLOADING");
  report();

  const queue = pendingChunks(ranges, init.existing_chunks);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) throw new UploadError("cancelled");
      const range = queue[cursor];
      if (!range) return;
      cursor += 1;
      await sendChunk(ctx, init.upload_id, file, range, sendChunkHash, options.retry, signal);
      uploadedBytes += range.size;
      chunksDone += 1;
      meter.record(range.size, now());
      report();
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, queue.length || 1));
  try {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } catch (error) {
    if (isAbort(error)) throw new UploadError("cancelled");
    throw error;
  }

  throwIfAborted();
  emitStatus("VERIFYING");

  const completed = await withRetry(
    () => postJson<UploadCompleteResponse>(ctx, API_ROUTES.uploadComplete(init.upload_id)),
    options.retry,
  );

  emitStatus(completed.status);
  uploadedBytes = file.size;
  report();

  return {
    uploadId: completed.upload_id,
    transferId: completed.transfer_id,
    status: completed.status,
    verified: completed.verified,
    storedFilename: completed.stored_filename ?? null,
    sha256: completed.sha256 ?? null,
    size: completed.size,
  };
}

async function sendChunk(
  ctx: HttpContext,
  uploadId: string,
  file: FileLike,
  range: ChunkRange,
  sendChunkHash: boolean,
  retry: RetryOptions | undefined,
  signal?: AbortSignal,
): Promise<void> {
  await withRetry(
    async () => {
      if (signal?.aborted) throw abortError();
      const buffer = await file.slice(range.start, range.end).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const params = new URLSearchParams({ chunk_index: String(range.index) });
      if (sendChunkHash) params.set("chunk_hash", sha256Hex(bytes));
      await postBinary(ctx, `${API_ROUTES.uploadChunk(uploadId)}?${params.toString()}`, bytes);
    },
    { ...retry, signal },
  );
}

/** Devam eden yuklemeyi sunucuda da iptal eder (PRD §26). */
export async function cancelUpload(fetchLike: FetchLike, uploadId: string, token?: string | null): Promise<void> {
  try {
    await del({ fetch: fetchLike, token: token ?? null }, API_ROUTES.upload(uploadId));
  } catch {
    // Iptal en iyi cabadir; kullaniciya ek hata gosterilmez.
  }
}
