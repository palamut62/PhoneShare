/** Test yardimcilari — uretim kodunda kullanilmaz. */

import type { FetchLike, FileLike } from "./types";

export class FakeFile implements FileLike {
  constructor(
    readonly name: string,
    private readonly bytes: Uint8Array,
    readonly type = "application/octet-stream",
  ) {}

  get size(): number {
    return this.bytes.length;
  }

  slice(start: number, end: number) {
    const part = this.bytes.slice(start, end);
    return {
      arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
    };
  }
}

export function makeBytes(length: number, seed = 7): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = state & 0xff;
  }
  return out;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export interface RecordedCall {
  url: string;
  method: string;
  body: BodyInit | null | undefined;
  headers: Record<string, string>;
}

export interface MockServerOptions {
  chunkSize?: number;
  existingChunks?: number[];
  totalChunks?: number;
  /** Belirli parca indekslerinde kac kez hata donsun. */
  failChunkTimes?: Record<number, number>;
  failChunkStatus?: number;
  retryAfter?: string;
  completeStatus?: number;
  completeCode?: string;
  initStatus?: number;
  initCode?: string;
}

export function createMockServer(options: MockServerOptions = {}) {
  const calls: RecordedCall[] = [];
  const receivedChunks: number[] = [];
  const failCounters = { ...(options.failChunkTimes ?? {}) };

  const fetchLike: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body,
      headers: init?.headers ?? {},
    });

    if (url.endsWith("/api/uploads/init")) {
      if (options.initStatus) {
        return jsonResponse({ code: options.initCode ?? "unknown", message: "x" }, options.initStatus);
      }
      return jsonResponse({
        upload_id: "u_1",
        chunk_size: options.chunkSize ?? 4,
        existing_chunks: options.existingChunks ?? [],
        transfer_id: "t_1",
        total_chunks: options.totalChunks ?? 1,
      });
    }

    if (url.includes("/chunk?")) {
      const index = Number(new URL(url, "http://x").searchParams.get("chunk_index"));
      const remaining = failCounters[index] ?? 0;
      if (remaining > 0) {
        failCounters[index] = remaining - 1;
        const status = options.failChunkStatus ?? 503;
        return jsonResponse(
          { code: status === 429 ? "rate_limited" : "server_error", message: "x" },
          status,
          options.retryAfter ? { "Retry-After": options.retryAfter } : {},
        );
      }
      receivedChunks.push(index);
      return jsonResponse({
        upload_id: "u_1",
        chunk_index: index,
        received_bytes: 0,
        received_chunks: receivedChunks.length,
        total_chunks: options.totalChunks ?? 1,
      });
    }

    if (url.endsWith("/complete")) {
      if (options.completeStatus) {
        return jsonResponse(
          { code: options.completeCode ?? "checksum_mismatch", message: "x" },
          options.completeStatus,
        );
      }
      return jsonResponse({
        upload_id: "u_1",
        transfer_id: "t_1",
        status: "COMPLETED",
        verified: true,
        stored_filename: "rapor.pdf",
        target_id: "belgeler",
        sha256: "a".repeat(64),
        size: 0,
      });
    }

    return jsonResponse({ code: "not_found", message: "x" }, 404);
  };

  return { fetchLike, calls, receivedChunks };
}
