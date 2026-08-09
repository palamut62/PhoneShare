"use client";

import type { TargetResponse } from "@phoneshare/shared-types";
import { AnimatePresence, motion } from "framer-motion";
import { CloudOff, Info, Send, X } from "lucide-react";
import * as React from "react";

import { TargetPicker } from "@/components/target-picker";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/upload/speed";

/** 250 MB ustu transferlerde PRD §56 uyarisi gosterilir. */
const LARGE_TRANSFER_BYTES = 250 * 1024 * 1024;

/** PRD §18 — dosya onizleme / onay ekrani. */
export function FileReview({
  files,
  targets,
  targetId,
  onTargetChange,
  onRemove,
  onCancel,
  onConfirm,
  isOnline,
  deviceName,
  locale,
}: {
  files: File[];
  targets: TargetResponse[];
  targetId: string | null;
  onTargetChange: (id: string | null) => void;
  onRemove: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
  isOnline: boolean;
  deviceName: string | null;
  locale: string;
}) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const headingId = React.useId();

  return (
    <AnimatePresence>
      {files.length > 0 ? (
        <motion.div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id={headingId} className="text-lg font-semibold">
                Gönderilecek Dosyalar
              </h2>
              <Button variant="ghost" size="icon" aria-label="Kapat" onClick={onCancel}>
                <X aria-hidden className="h-4 w-4" />
              </Button>
            </div>

            <ul className="mt-3 flex flex-col divide-y divide-border">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.size, locale)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${file.name} dosyasını listeden çıkar`}
                    onClick={() => onRemove(index)}
                  >
                    <X aria-hidden className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-sm font-medium">
              {files.length} Dosya · {formatBytes(total, locale)}
            </p>

            <div className="mt-4">
              <TargetPicker
                id="review-target"
                targets={targets}
                value={targetId}
                onChange={onTargetChange}
                label="Hedef klasör"
              />
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Hedef bilgisayar: <strong>{deviceName ?? "Bilgisayar"}</strong>
            </p>

            {!isOnline ? (
              <p
                role="status"
                className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-xs text-foreground"
              >
                <CloudOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                Bilgisayar çevrimdışı. Gönderim için bilgisayarın çevrimiçi olması gerekiyor.
              </p>
            ) : null}

            {total > LARGE_TRANSFER_BYTES ? (
              <p
                role="status"
                className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-foreground"
              >
                <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Transfer tamamlanana kadar PhoneShare&apos;ı açık tutmanız önerilir.
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" size="lg" className="flex-1" onClick={onCancel}>
                Vazgeç
              </Button>
              <Button size="lg" className="flex-1" onClick={onConfirm} disabled={!isOnline}>
                <Send aria-hidden className="h-4 w-4" />
                GÖNDER
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
