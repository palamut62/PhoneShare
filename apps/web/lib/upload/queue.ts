/**
 * Transfer kuyrugu ve durum makinesi (PRD §26).
 *
 * PRD §54: dosya **icerigi** tarayicida kalici olarak saklanmaz. Kuyruk meta verisi
 * IndexedDB'ye yazilir; sayfa yenilendiginde `hasFileHandle` false olur ve kullanicidan
 * dosyayi tekrar secmesi istenir.
 */

import { uploadFile, cancelUpload, type UploadFileOptions } from "./client";
import { toUserFacingError, UploadError } from "./errors";
import type {
  FetchLike,
  FileLike,
  QueueItem,
  TransferStatus,
  UploadProgress,
  UserFacingError,
} from "./types";

const TRANSITIONS: Record<TransferStatus, readonly TransferStatus[]> = {
  QUEUED: ["PREPARING", "CANCELLED", "FAILED"],
  PREPARING: ["UPLOADING", "CANCELLED", "FAILED"],
  UPLOADING: ["VERIFYING", "CANCELLED", "FAILED"],
  VERIFYING: ["COMPLETED", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: ["QUEUED"],
  CANCELLED: ["QUEUED"],
};

export function canTransition(from: TransferStatus, to: TransferStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isTerminal(status: TransferStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

export function emptyProgress(totalBytes: number): UploadProgress {
  return {
    uploadedBytes: 0,
    totalBytes,
    percent: 0,
    bytesPerSecond: null,
    etaSeconds: null,
    chunksDone: 0,
    totalChunks: 0,
  };
}

export interface QueueOptions {
  fetch: FetchLike;
  token?: string | null;
  /** Es zamanli dosya sayisi (varsayilan 1 = sirali). */
  fileConcurrency?: number;
  /** Dosya icindeki es zamanli parca sayisi. */
  chunkConcurrency?: number;
  maxFileBytes?: number;
  deviceName?: string;
  now?: () => number;
  newId?: () => string;
  /** Kalicilik: meta veriler IndexedDB'ye yazilir. */
  persist?: (items: QueueItem[]) => void;
  uploader?: (options: UploadFileOptions) => ReturnType<typeof uploadFile>;
}

type Listener = (items: QueueItem[]) => void;

interface Entry {
  item: QueueItem;
  file: FileLike | null;
  controller: AbortController | null;
}

export class UploadQueue {
  private entries = new Map<string, Entry>();
  private order: string[] = [];
  private listeners = new Set<Listener>();
  private running = 0;
  private counter = 0;

  constructor(private options: QueueOptions) {}

  /** Token / cihaz adi / limit gibi calisma zamani secenekleri gunceller. */
  configure(patch: Partial<QueueOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.items());
    return () => this.listeners.delete(listener);
  }

  items(): QueueItem[] {
    return this.order
      .map((id) => this.entries.get(id)?.item)
      .filter((item): item is QueueItem => Boolean(item));
  }

  get(id: string): QueueItem | undefined {
    return this.entries.get(id)?.item;
  }

  /** Kuyruga dosya ekler (henuz baslatmaz). */
  add(file: FileLike, targetId: string | null): QueueItem {
    const id = this.options.newId?.() ?? `q_${++this.counter}_${this.now()}`;
    const item: QueueItem = {
      id,
      filename: file.name,
      size: file.size,
      mimeType: file.type || null,
      targetId,
      status: "QUEUED",
      uploadId: null,
      transferId: null,
      sha256: null,
      progress: emptyProgress(file.size),
      error: null,
      createdAt: this.now(),
      updatedAt: this.now(),
      hasFileHandle: true,
    };
    this.entries.set(id, { item, file, controller: null });
    this.order.push(id);
    this.emit();
    return item;
  }

  /** Kalici meta verilerden kuyrugu geri yukler; dosya icerigi geri gelmez (PRD §54). */
  restore(items: readonly QueueItem[]): void {
    for (const stored of items) {
      if (this.entries.has(stored.id)) continue;
      const status: TransferStatus = isTerminal(stored.status) ? stored.status : "FAILED";
      const item: QueueItem = {
        ...stored,
        status,
        hasFileHandle: false,
        error:
          status === "FAILED" && !isTerminal(stored.status)
            ? {
                code: "unknown",
                title: "Dosya yeniden seçilmeli",
                message:
                  "Sayfa yenilendiği için dosya içeriği kayboldu. Göndermek için dosyayı tekrar seçin.",
                actionLabel: "Dosya Seç",
                action: "retry",
                retryable: false,
              }
            : stored.error,
      };
      this.entries.set(stored.id, { item, file: null, controller: null });
      this.order.push(stored.id);
    }
    this.emit();
  }

  /** Bekleyen isleri calistirir. */
  start(): void {
    const limit = Math.max(1, this.options.fileConcurrency ?? 1);
    while (this.running < limit) {
      const next = this.items().find(
        (item) => item.status === "QUEUED" && this.entries.get(item.id)?.file,
      );
      if (!next) return;
      this.running += 1;
      void this.run(next.id).finally(() => {
        this.running -= 1;
        this.start();
      });
    }
  }

  cancel(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.controller?.abort();
    if (entry.item.uploadId) {
      void cancelUpload(this.options.fetch, entry.item.uploadId, this.options.token);
    }
    if (!isTerminal(entry.item.status)) {
      this.patch(id, { status: "CANCELLED", error: toUserFacingError(new UploadError("cancelled")) });
    }
  }

  /** PRD §39 — basarisiz transferi tekrar dener. */
  retry(id: string, file?: FileLike): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (!isTerminal(entry.item.status)) return false;
    if (entry.item.status === "COMPLETED") return false;
    const nextFile = file ?? entry.file;
    if (!nextFile) return false;
    entry.file = nextFile;
    entry.controller = null;
    this.patch(id, {
      status: "QUEUED",
      error: null,
      hasFileHandle: true,
      progress: emptyProgress(entry.item.size),
    });
    this.start();
    return true;
  }

  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.controller?.abort();
    this.entries.delete(id);
    this.order = this.order.filter((existing) => existing !== id);
    this.emit();
  }

  clearFinished(): void {
    for (const item of this.items()) {
      if (isTerminal(item.status)) this.remove(item.id);
    }
  }

  /** Toplu ozet (PRD §25). */
  summary(): {
    total: number;
    completed: number;
    failed: number;
    uploadedBytes: number;
    totalBytes: number;
    percent: number;
  } {
    const items = this.items();
    const totalBytes = items.reduce((sum, item) => sum + item.size, 0);
    const uploadedBytes = items.reduce((sum, item) => sum + item.progress.uploadedBytes, 0);
    return {
      total: items.length,
      completed: items.filter((item) => item.status === "COMPLETED").length,
      failed: items.filter((item) => item.status === "FAILED").length,
      uploadedBytes,
      totalBytes,
      percent: totalBytes === 0 ? 0 : Math.min(100, (uploadedBytes / totalBytes) * 100),
    };
  }

  private async run(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry?.file) return;
    const controller = new AbortController();
    entry.controller = controller;

    const upload = this.options.uploader ?? uploadFile;

    try {
      const result = await upload({
        file: entry.file,
        targetId: entry.item.targetId,
        fetch: this.options.fetch,
        token: this.options.token,
        signal: controller.signal,
        concurrency: this.options.chunkConcurrency,
        maxFileBytes: this.options.maxFileBytes,
        now: this.options.now,
        onStatus: (status) => this.transition(id, status),
        onProgress: (progress) => this.patch(id, { progress }),
        onInit: (init) => this.patch(id, { uploadId: init.upload_id, transferId: init.transfer_id }),
      });
      this.patch(id, {
        status: result.status,
        transferId: result.transferId,
        uploadId: result.uploadId,
        sha256: result.sha256,
        error: null,
      });
    } catch (error) {
      const userError: UserFacingError = toUserFacingError(error, this.options.deviceName);
      this.patch(id, {
        status: userError.code === "cancelled" ? "CANCELLED" : "FAILED",
        error: userError,
      });
    }
  }

  private transition(id: string, to: TransferStatus): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (!canTransition(entry.item.status, to)) return;
    this.patch(id, { status: to });
  }

  private patch(id: string, patch: Partial<QueueItem>): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.item = { ...entry.item, ...patch, updatedAt: this.now() };
    this.emit();
  }

  private emit(): void {
    const items = this.items();
    this.options.persist?.(items);
    for (const listener of this.listeners) listener(items);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
