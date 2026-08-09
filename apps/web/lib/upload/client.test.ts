import { describe, expect, it, vi } from "vitest";

import { uploadFile } from "./client";
import { UploadError } from "./errors";
import { sha256Hex } from "./sha256";
import { FakeFile, createMockServer, makeBytes } from "./test-utils";
import type { TransferStatus, UploadProgress } from "./types";

const noSleep = async () => {};
const retry = { sleep: noSleep, jitter: 0 };

function file(size: number, name = "rapor.pdf") {
  return new FakeFile(name, makeBytes(size), "application/pdf");
}

describe("uploadFile", () => {
  it("tum parcalari sirayla gonderir ve tamamlar", async () => {
    const server = createMockServer({ chunkSize: 4, totalChunks: 3 });
    const result = await uploadFile({
      file: file(10),
      targetId: "belgeler",
      fetch: server.fetchLike,
      concurrency: 1,
      retry,
    });
    expect(server.receivedChunks.sort()).toEqual([0, 1, 2]);
    expect(result.status).toBe("COMPLETED");
    expect(result.verified).toBe(true);
  });

  it("init istegine sha256 ve target_id gonderir, gercek yol gondermez", async () => {
    const server = createMockServer({ chunkSize: 8 });
    const bytes = makeBytes(8);
    await uploadFile({
      file: new FakeFile("a.bin", bytes),
      targetId: "akpazar",
      fetch: server.fetchLike,
      retry,
    });
    const init = server.calls.find((call) => call.url.endsWith("/api/uploads/init"));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.target_id).toBe("akpazar");
    expect(body.sha256).toBe(sha256Hex(bytes));
    expect(body).not.toHaveProperty("path");
  });

  it("resume: mevcut parcalari atlar", async () => {
    const server = createMockServer({ chunkSize: 4, existingChunks: [0, 1], totalChunks: 3 });
    await uploadFile({ file: file(10), targetId: null, fetch: server.fetchLike, retry });
    expect(server.receivedChunks).toEqual([2]);
  });

  it("resume atlanan baytlar ilerlemeye dahildir", async () => {
    const server = createMockServer({ chunkSize: 4, existingChunks: [0, 1], totalChunks: 3 });
    const first: UploadProgress[] = [];
    await uploadFile({
      file: file(10),
      targetId: null,
      fetch: server.fetchLike,
      retry,
      onProgress: (progress) => first.push(progress),
    });
    expect(first[0]?.uploadedBytes).toBe(8);
    expect(first[0]?.percent).toBeCloseTo(80, 5);
  });

  it("her parcaya chunk_hash ekler", async () => {
    const server = createMockServer({ chunkSize: 4 });
    const bytes = makeBytes(4);
    await uploadFile({ file: new FakeFile("a.bin", bytes), targetId: null, fetch: server.fetchLike, retry });
    const chunkCall = server.calls.find((call) => call.url.includes("/chunk?"));
    expect(chunkCall?.url).toContain(`chunk_hash=${sha256Hex(bytes)}`);
    expect(chunkCall?.headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("token'i Authorization basliginda gonderir, URL'e yazmaz", async () => {
    const server = createMockServer({ chunkSize: 4 });
    await uploadFile({ file: file(4), targetId: null, fetch: server.fetchLike, token: "gizli", retry });
    for (const call of server.calls) {
      expect(call.url).not.toContain("gizli");
    }
    expect(server.calls[0]?.headers.Authorization).toBe("Bearer gizli");
  });

  it("durum makinesini PRD §26 sirasinda ilerletir", async () => {
    const server = createMockServer({ chunkSize: 4 });
    const statuses: TransferStatus[] = [];
    await uploadFile({
      file: file(4),
      targetId: null,
      fetch: server.fetchLike,
      retry,
      onStatus: (status) => statuses.push(status),
    });
    expect(statuses).toEqual(["PREPARING", "UPLOADING", "VERIFYING", "COMPLETED"]);
  });

  it("gecici parca hatasinda yeniden dener", async () => {
    const server = createMockServer({ chunkSize: 4, failChunkTimes: { 0: 2 } });
    await uploadFile({ file: file(4), targetId: null, fetch: server.fetchLike, retry });
    expect(server.receivedChunks).toEqual([0]);
    expect(server.calls.filter((call) => call.url.includes("/chunk?"))).toHaveLength(3);
  });

  it("429 yanitinda Retry-After suresi kadar bekler", async () => {
    const server = createMockServer({
      chunkSize: 4,
      failChunkTimes: { 0: 1 },
      failChunkStatus: 429,
      retryAfter: "2",
    });
    const sleep = vi.fn(async () => {});
    await uploadFile({
      file: file(4),
      targetId: null,
      fetch: server.fetchLike,
      retry: { sleep, jitter: 0 },
    });
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it("checksum_mismatch hatasini oldugu gibi yukseltir", async () => {
    const server = createMockServer({ chunkSize: 4, completeStatus: 422, completeCode: "checksum_mismatch" });
    await expect(
      uploadFile({ file: file(4), targetId: null, fetch: server.fetchLike, retry }),
    ).rejects.toMatchObject({ code: "checksum_mismatch" });
  });

  it("507 insufficient_storage hatasini iletir", async () => {
    const server = createMockServer({ initStatus: 507, initCode: "insufficient_storage" });
    await expect(
      uploadFile({ file: file(4), targetId: null, fetch: server.fetchLike, retry }),
    ).rejects.toMatchObject({ code: "insufficient_storage" });
  });

  it("boyut limiti on kontrolu ag istegi yapmadan calisir", async () => {
    const fetchLike = vi.fn();
    await expect(
      uploadFile({
        file: file(100),
        targetId: null,
        fetch: fetchLike as never,
        maxFileBytes: 50,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(fetchLike).not.toHaveBeenCalled();
  });

  it("iptal edildiginde cancelled hatasi verir", async () => {
    const server = createMockServer({ chunkSize: 4 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadFile({
        file: file(8),
        targetId: null,
        fetch: server.fetchLike,
        signal: controller.signal,
        retry,
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("ag hatasi UploadError('network_error') olur", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      uploadFile({
        file: file(4),
        targetId: null,
        fetch: failing as never,
        retry: { sleep: noSleep, maxAttempts: 1 },
      }),
    ).rejects.toBeInstanceOf(UploadError);
  });

  it("es zamanli parca gonderiminde tum parcalar ulasir", async () => {
    const server = createMockServer({ chunkSize: 4, totalChunks: 5 });
    await uploadFile({
      file: file(20),
      targetId: null,
      fetch: server.fetchLike,
      concurrency: 3,
      retry,
    });
    expect([...server.receivedChunks].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("ilerleme yuzdesi 100'e ulasir ve hiz raporlanir", async () => {
    const server = createMockServer({ chunkSize: 4 });
    let time = 0;
    const progress: UploadProgress[] = [];
    await uploadFile({
      file: file(12),
      targetId: null,
      fetch: server.fetchLike,
      concurrency: 1,
      retry,
      now: () => (time += 100),
      onProgress: (value) => progress.push(value),
    });
    expect(progress.at(-1)?.percent).toBe(100);
    expect(progress.at(-1)?.uploadedBytes).toBe(12);
    expect(progress.some((value) => (value.bytesPerSecond ?? 0) > 0)).toBe(true);
  });
});
