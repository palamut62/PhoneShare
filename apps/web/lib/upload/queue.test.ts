import { describe, expect, it, vi } from "vitest";

import { UploadError } from "./errors";
import { UploadQueue, canTransition, isTerminal } from "./queue";
import { FakeFile, createMockServer, makeBytes } from "./test-utils";
import type { QueueItem } from "./types";

function makeQueue(overrides: Partial<ConstructorParameters<typeof UploadQueue>[0]> = {}) {
  const server = createMockServer({ chunkSize: 4 });
  let counter = 0;
  const queue = new UploadQueue({
    fetch: server.fetchLike,
    newId: () => `q_${++counter}`,
    ...overrides,
  });
  return { queue, server };
}

const file = (size = 8, name = "rapor.pdf") => new FakeFile(name, makeBytes(size), "application/pdf");

describe("kuyruk durum makinesi (PRD §26)", () => {
  it("gecerli gecisleri kabul eder", () => {
    expect(canTransition("QUEUED", "PREPARING")).toBe(true);
    expect(canTransition("UPLOADING", "VERIFYING")).toBe(true);
    expect(canTransition("VERIFYING", "COMPLETED")).toBe(true);
  });

  it("gecersiz gecisleri reddeder", () => {
    expect(canTransition("QUEUED", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "UPLOADING")).toBe(false);
    expect(canTransition("PREPARING", "VERIFYING")).toBe(false);
  });

  it("terminal durumlari dogru tanir", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("UPLOADING")).toBe(false);
  });

  it("basarisiz veya iptal edilen isler yeniden kuyruga alinabilir", () => {
    expect(canTransition("FAILED", "QUEUED")).toBe(true);
    expect(canTransition("CANCELLED", "QUEUED")).toBe(true);
  });
});

describe("UploadQueue", () => {
  it("dosya ekler ve QUEUED durumunda baslar", () => {
    const { queue } = makeQueue();
    const item = queue.add(file(), "belgeler");
    expect(item.status).toBe("QUEUED");
    expect(queue.items()).toHaveLength(1);
  });

  it("kuyrugu calistirip transferi tamamlar", async () => {
    const { queue } = makeQueue();
    queue.add(file(8), "belgeler");
    queue.start();
    await vi.waitFor(() => expect(queue.items()[0]?.status).toBe("COMPLETED"));
    expect(queue.items()[0]?.transferId).toBe("t_1");
  });

  it("hatada kullanici dostu mesaj uretir", async () => {
    const server = createMockServer({ chunkSize: 4, completeStatus: 422, completeCode: "checksum_mismatch" });
    const queue = new UploadQueue({ fetch: server.fetchLike });
    queue.add(file(8), null);
    queue.start();
    await vi.waitFor(() => expect(queue.items()[0]?.status).toBe("FAILED"));
    expect(queue.items()[0]?.error?.code).toBe("checksum_mismatch");
    expect(queue.items()[0]?.error?.actionLabel).toBe("Try Again");
  });

  it("iptal edilen is CANCELLED olur", () => {
    const { queue } = makeQueue();
    const item = queue.add(file(), null);
    queue.cancel(item.id);
    expect(queue.get(item.id)?.status).toBe("CANCELLED");
  });

  it("tamamlanmis is yeniden denenmez", async () => {
    const { queue } = makeQueue();
    const item = queue.add(file(4), null);
    queue.start();
    await vi.waitFor(() => expect(queue.get(item.id)?.status).toBe("COMPLETED"));
    expect(queue.retry(item.id)).toBe(false);
  });

  it("basarisiz is tekrar denenebilir (PRD §39)", () => {
    const { queue } = makeQueue();
    const item = queue.add(file(), null);
    queue.cancel(item.id);
    expect(queue.retry(item.id)).toBe(true);
    expect(queue.get(item.id)?.status).not.toBe("CANCELLED");
  });

  it("abonelere degisiklikleri bildirir", () => {
    const { queue } = makeQueue();
    const listener = vi.fn();
    queue.subscribe(listener);
    queue.add(file(), null);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("meta verileri kalici depoya yazar", () => {
    const persist = vi.fn();
    const { queue } = makeQueue({ persist });
    queue.add(file(), null);
    const saved = persist.mock.calls.at(-1)?.[0] as QueueItem[];
    expect(saved[0]?.filename).toBe("rapor.pdf");
  });

  it("PRD §54: yenileme sonrasi dosya icerigi geri gelmez, yeniden secim istenir", () => {
    const { queue } = makeQueue();
    queue.restore([
      {
        id: "old",
        filename: "video.mov",
        size: 100,
        mimeType: "video/quicktime",
        targetId: "genel",
        status: "UPLOADING",
        uploadId: null,
        transferId: null,
        sha256: null,
        progress: { uploadedBytes: 10, totalBytes: 100, percent: 10, bytesPerSecond: null, etaSeconds: null, chunksDone: 0, totalChunks: 1 },
        error: null,
        createdAt: 1,
        updatedAt: 1,
        hasFileHandle: true,
      },
    ]);
    const restored = queue.get("old");
    expect(restored?.status).toBe("FAILED");
    expect(restored?.hasFileHandle).toBe(false);
    expect(restored?.error?.message).toContain("Select the file again");
    expect(queue.retry("old")).toBe(false);
  });

  it("dosya olmadan geri yuklenen is, dosya verilince tekrar denenebilir", () => {
    const { queue } = makeQueue();
    queue.restore([
      {
        id: "old",
        filename: "a.pdf",
        size: 4,
        mimeType: null,
        targetId: null,
        status: "FAILED",
        uploadId: null,
        transferId: null,
        sha256: null,
        progress: { uploadedBytes: 0, totalBytes: 4, percent: 0, bytesPerSecond: null, etaSeconds: null, chunksDone: 0, totalChunks: 1 },
        error: null,
        createdAt: 1,
        updatedAt: 1,
        hasFileHandle: true,
      },
    ]);
    expect(queue.retry("old", file(4, "a.pdf"))).toBe(true);
  });

  it("coklu dosyada toplu ozet hesaplar (PRD §25)", async () => {
    const { queue } = makeQueue();
    queue.add(file(4, "a.pdf"), null);
    queue.add(file(4, "b.pdf"), null);
    queue.start();
    await vi.waitFor(() => expect(queue.summary().completed).toBe(2));
    const summary = queue.summary();
    expect(summary.total).toBe(2);
    expect(summary.totalBytes).toBe(8);
    expect(summary.percent).toBe(100);
  });

  it("tamamlanan isleri listeden temizler", async () => {
    const { queue } = makeQueue();
    queue.add(file(4), null);
    queue.start();
    await vi.waitFor(() => expect(queue.items()[0]?.status).toBe("COMPLETED"));
    queue.clearFinished();
    expect(queue.items()).toHaveLength(0);
  });

  it("ozel yukleyici ile hata durumu FAILED'e duser", async () => {
    const { queue } = makeQueue({
      uploader: async () => {
        throw new UploadError("insufficient_storage", { status: 507 });
      },
    });
    queue.add(file(4), null);
    queue.start();
    await vi.waitFor(() => expect(queue.items()[0]?.status).toBe("FAILED"));
    expect(queue.items()[0]?.error?.title).toBe("Not enough disk space");
  });
});
