"use client";

import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { loadQueueMeta, saveQueueMeta } from "@/lib/storage/session";
import { UploadQueue } from "@/lib/upload/queue";
import type { QueueItem } from "@/lib/upload/types";

export interface UseUploadQueue {
  items: QueueItem[];
  enqueue: (files: File[], targetId: string | null) => void;
  start: () => void;
  cancel: (id: string) => void;
  retry: (id: string, file?: File) => boolean;
  remove: (id: string) => void;
  clearFinished: () => void;
  summary: ReturnType<UploadQueue["summary"]>;
  active: boolean;
}

export function useUploadQueue(deviceName: string | null, maxFileBytes?: number): UseUploadQueue {
  const { session } = useApp();
  const queryClient = useQueryClient();
  const [items, setItems] = React.useState<QueueItem[]>([]);

  const queueRef = React.useRef<UploadQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new UploadQueue({
      fetch: (url, init) => fetch(url, init as RequestInit),
      fileConcurrency: 1,
      chunkConcurrency: 3,
      // PRD §54 — yalnizca meta veri saklanir, dosya icerigi degil.
      persist: (next) => void saveQueueMeta(next.map(stripVolatile)),
    });
  }
  const queue = queueRef.current;

  // Token / cihaz adi / limit degistikce kuyruk secenekleri guncellenir.
  queue.configure({
    token: session?.token ?? null,
    deviceName: deviceName ?? "bilgisayar",
    maxFileBytes,
  });

  React.useEffect(() => queue.subscribe(setItems), [queue]);

  React.useEffect(() => {
    void (async () => {
      const stored = await loadQueueMeta<QueueItem[]>();
      if (stored?.length) queue.restore(stored);
    })();
  }, [queue]);

  const previousStatuses = React.useRef(new Map<string, string>());
  React.useEffect(() => {
    let changed = false;
    for (const item of items) {
      if (previousStatuses.current.get(item.id) !== item.status) {
        previousStatuses.current.set(item.id, item.status);
        if (item.status === "COMPLETED") changed = true;
      }
    }
    if (changed) void queryClient.invalidateQueries({ queryKey: ["transfers"] });
  }, [items, queryClient]);

  return {
    items,
    enqueue: React.useCallback(
      (files: File[], targetId: string | null) => {
        for (const file of files) queue.add(file, targetId);
      },
      [queue],
    ),
    start: React.useCallback(() => queue.start(), [queue]),
    cancel: React.useCallback((id: string) => queue.cancel(id), [queue]),
    retry: React.useCallback((id: string, file?: File) => queue.retry(id, file), [queue]),
    remove: React.useCallback((id: string) => queue.remove(id), [queue]),
    clearFinished: React.useCallback(() => queue.clearFinished(), [queue]),
    summary: queue.summary(),
    active: items.some((item) => ["QUEUED", "PREPARING", "UPLOADING", "VERIFYING"].includes(item.status)),
  };
}

function stripVolatile(item: QueueItem): QueueItem {
  return { ...item, hasFileHandle: false };
}
