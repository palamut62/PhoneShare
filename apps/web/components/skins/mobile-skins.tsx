"use client";

/**
 * Telefon gorunum stilleri (Ayarlar > Gorunum > Telefon arayuzu).
 *
 * Her stil YALNIZCA sunumdur: gonderim, kuyruk ve hedef mantigi ana ekrandan
 * gelir. Sahte veri kullanilmaz; ilerleme/hiz/parca degerleri gercek yukleme
 * kuyrugundan okunur. Dokunma hedefleri her stilde >= 44px kalir (PRD §70).
 */

import { CheckCircle2, CircleAlert, ImageUp, Laptop, Loader2, Upload, X } from "lucide-react";
import * as React from "react";

import { TargetPicker } from "@/components/target-picker";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatEta, formatSpeed } from "@/lib/upload/speed";
import type { QueueItem } from "@/lib/upload/types";
import { cn } from "@/lib/utils";

import type { MobileSkinProps } from "./types";

const ACTIVE: QueueItem["status"][] = ["QUEUED", "PREPARING", "UPLOADING", "VERIFYING"];

function activeItem(items: QueueItem[]): QueueItem | null {
  return items.find((item) => ACTIVE.includes(item.status)) ?? items[0] ?? null;
}

function StatusDot({ status }: { status: QueueItem["status"] }) {
  if (status === "COMPLETED") return <CheckCircle2 aria-hidden className="h-4 w-4 text-success" />;
  if (status === "FAILED") return <CircleAlert aria-hidden className="h-4 w-4 text-danger" />;
  if (status === "CANCELLED") return <X aria-hidden className="h-4 w-4 text-muted-foreground" />;
  return <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary" />;
}

/** Kuyruk satirlari: her stilde ayni eylemler (iptal/tekrar dene) sunulur. */
function QueueRows({
  items,
  onCancel,
  onRetry,
  locale,
}: Pick<MobileSkinProps, "items" | "onCancel" | "onRetry" | "locale">) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            <StatusDot status={item.status} />
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.filename}</p>
            <span className="text-xs text-muted-foreground">{Math.round(item.progress.percent)}%</span>
          </div>
          <Progress className="mt-2" value={item.progress.percent} label={item.filename} />
          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {formatBytes(item.progress.uploadedBytes, locale)} / {formatBytes(item.size, locale)}
              {item.progress.bytesPerSecond ? ` · ${formatSpeed(item.progress.bytesPerSecond, locale)}` : ""}
            </span>
            {ACTIVE.includes(item.status) ? (
              <button
                type="button"
                className="min-h-11 px-2 font-medium text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onCancel(item.id)}
              >
                Cancel
              </button>
            ) : item.status === "FAILED" ? (
              <button
                type="button"
                className="min-h-11 px-2 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRetry(item.id)}
              >
                Retry
              </button>
            ) : null}
          </div>
          {item.error ? <p className="mt-1 text-xs text-danger">{item.error.message}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Mobil 1 — Radar: bilgisayar merkezde, tek dokunusla gonderim. */
export function MobileRadarSkin(props: MobileSkinProps) {
  const { isOnline, deviceName, targets, targetId, onTargetChange, items, onPickFiles, onPickPhotos } = props;
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center py-4">
          <div className="relative flex h-52 w-52 items-center justify-center">
            {[0, 1, 2].map((ring) => (
              <span
                key={ring}
                aria-hidden
                className={cn(
                  "absolute rounded-full border",
                  isOnline ? "border-primary/30" : "border-border",
                  isOnline && "motion-safe:animate-ping",
                )}
                style={{
                  height: `${100 + ring * 50}px`,
                  width: `${100 + ring * 50}px`,
                  animationDuration: `${2.4 + ring * 0.6}s`,
                }}
              />
            ))}
            <div
              className={cn(
                "relative flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-3xl text-white shadow-lg",
                isOnline ? "bg-primary" : "bg-muted-foreground",
              )}
            >
              <Laptop aria-hidden className="h-7 w-7" />
              <span className="max-w-[5rem] truncate px-1 text-[10px] font-semibold">
                {deviceName ?? "PC"}
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {isOnline ? "Computer discovered on the local network" : "Computer is offline"}
          </p>
        </div>

        <div className="mt-2">
          <TargetPicker targets={targets} value={targetId} onChange={onTargetChange} label="Target" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={onPickFiles}>
            <Upload aria-hidden className="h-4 w-4" />
            Send file
          </Button>
          <Button size="lg" variant="secondary" onClick={onPickPhotos}>
            <ImageUp aria-hidden className="h-4 w-4" />
            Send photo
          </Button>
        </div>
      </Card>

      {items.length > 0 ? (
        <Card>
          <CardTitle>TRANSFERS</CardTitle>
          <QueueRows {...props} />
        </Card>
      ) : null}
    </div>
  );
}

/** Mobil 3 — Chunk HUD: parca parca ilerleme ve dogrulama rozeti. */
export function MobileChunkHudSkin(props: MobileSkinProps) {
  const { targets, targetId, onTargetChange, items, summary, onPickFiles, locale } = props;
  const current = activeItem(items);
  const totalChunks = current?.progress.totalChunks ?? 0;
  // Cok sayida parcada her kareyi cizmek yerine 48 kutuluk bir ozet gosterilir.
  const cells = Math.min(totalChunks, 48);
  const doneRatio = totalChunks > 0 ? (current?.progress.chunksDone ?? 0) / totalChunks : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>CHUNK HUD</CardTitle>
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {current?.sha256 ? "SHA-256 ready" : "SHA-256 on completion"}
          </span>
        </div>

        {current ? (
          <>
            <p className="mt-3 truncate text-sm font-semibold">{current.filename}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {Math.round(current.progress.percent)}%
              </span>
              <span className="text-xs text-muted-foreground">
                {formatSpeed(current.progress.bytesPerSecond, locale)} ·{" "}
                {formatEta(current.progress.etaSeconds)}
              </span>
            </div>

            {cells > 0 ? (
              <div
                aria-hidden
                className="mt-3 grid gap-1"
                style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}
              >
                {Array.from({ length: cells }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-2.5 rounded-[3px]",
                      index / cells < doneRatio ? "bg-primary" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            ) : null}

            <p className="mt-2 text-xs text-muted-foreground">
              {current.progress.chunksDone} / {current.progress.totalChunks} chunks ·{" "}
              {formatBytes(current.progress.uploadedBytes, locale)} /{" "}
              {formatBytes(current.size, locale)}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No active transfer. Pick a file to see live chunk progress.
          </p>
        )}

        <div className="mt-3">
          <TargetPicker targets={targets} value={targetId} onChange={onTargetChange} label="Target" />
        </div>
        <Button size="lg" className="mt-3 w-full" onClick={onPickFiles}>
          <Upload aria-hidden className="h-4 w-4" />
          Send file
        </Button>
      </Card>

      {items.length > 1 ? (
        <Card>
          <CardTitle>
            QUEUE · {summary.completed}/{summary.total}
          </CardTitle>
          <QueueRows {...props} />
        </Card>
      ) : null}
    </div>
  );
}

/** Mobil 4 — Toplu hazirlik: gondermeden once dosya listesi ve toplam boyut. */
export function MobileStagingSkin(props: MobileSkinProps) {
  const { targets, targetId, onTargetChange, items, summary, onPickFiles, onPickPhotos, onClear, locale } =
    props;
  const pendingBytes = summary.totalBytes - summary.uploadedBytes;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>BATCH STAGING</CardTitle>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Files", value: String(summary.total) },
            { label: "Done", value: `${summary.completed}/${summary.total}` },
            { label: "Remaining", value: formatBytes(Math.max(0, pendingBytes), locale) },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-muted p-2">
              <dt className="text-[11px] uppercase text-muted-foreground">{stat.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <Progress className="mt-3" value={summary.percent} label="Total progress" />

        <div className="mt-3">
          <TargetPicker targets={targets} value={targetId} onChange={onTargetChange} label="Target" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="lg" onClick={onPickFiles}>
            <Upload aria-hidden className="h-4 w-4" />
            Add files
          </Button>
          <Button size="lg" variant="secondary" onClick={onPickPhotos}>
            <ImageUp aria-hidden className="h-4 w-4" />
            Add photos
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>FILES</CardTitle>
          {items.length > 0 ? (
            <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={onClear}>
              Clear completed
            </Button>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing staged yet.</p>
        ) : (
          <QueueRows {...props} />
        )}
      </Card>
    </div>
  );
}
