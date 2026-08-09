"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatEta, formatSpeed } from "@/lib/upload/speed";
import type { QueueItem } from "@/lib/upload/types";

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  QUEUED: "Queued",
  PREPARING: "Preparing",
  UPLOADING: "Sending",
  VERIFYING: "Verifying",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

/** PRD §24/§25 — dosya basina ilerleme + coklu dosyada toplu ozet. */
export function QueuePanel({
  items,
  summary,
  onCancel,
  onRetry,
  onClear,
  locale,
}: {
  items: QueueItem[];
  summary: { total: number; completed: number; percent: number; uploadedBytes: number; totalBytes: number };
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClear: () => void;
  locale: string;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <CardTitle>TRANSFERLER</CardTitle>
        <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onClear}>
          Clear completed
        </Button>
      </div>

      {summary.total > 1 ? (
        <div className="mt-3 rounded-xl bg-muted p-3">
          <p className="text-sm font-medium">
            {summary.total} Files · {summary.completed} / {summary.total} completed
          </p>
          <Progress className="mt-2" value={summary.percent} label="Toplam ilerleme" />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatBytes(summary.uploadedBytes, locale)} / {formatBytes(summary.totalBytes, locale)}
          </p>
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.filename}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    {item.status === "COMPLETED" ? (
                      <CheckCircle2 aria-hidden className="h-3.5 w-3.5 text-success" />
                    ) : item.status === "FAILED" ? (
                      <CircleAlert aria-hidden className="h-3.5 w-3.5 text-danger" />
                    ) : item.status === "CANCELLED" ? null : (
                      <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                    )}
                    {STATUS_LABEL[item.status]} · {formatBytes(item.size, locale)}
                  </p>
                </div>
                {item.status === "UPLOADING" || item.status === "PREPARING" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${item.filename} transferini iptal et`}
                    onClick={() => onCancel(item.id)}
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {item.status === "UPLOADING" || item.status === "VERIFYING" ? (
                <>
                  <Progress className="mt-2" value={item.progress.percent} label={item.filename} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    %{Math.round(item.progress.percent)} ·{" "}
                    {formatBytes(item.progress.uploadedBytes, locale)} /{" "}
                    {formatBytes(item.progress.totalBytes, locale)} ·{" "}
                    {formatSpeed(item.progress.bytesPerSecond, locale)} · Kalan:{" "}
                    {formatEta(item.progress.etaSeconds)}
                  </p>
                </>
              ) : null}

              {item.error ? (
                <div role="alert" className="mt-2 rounded-lg bg-danger/10 p-2.5">
                  <p className="text-xs font-semibold text-danger">{item.error.title}</p>
                  <p className="mt-1 text-xs text-foreground">{item.error.message}</p>
                  <Button
                    variant="secondary"
                    className="mt-2 min-h-11 text-xs"
                    onClick={() => onRetry(item.id)}
                  >
                    {item.error.actionLabel}
                  </Button>
                </div>
              ) : null}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </Card>
  );
}
