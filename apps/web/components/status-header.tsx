"use client";

import { useApp } from "@/components/app-providers";
import { cn } from "@/lib/utils";

/** PRD §14/§44 — `● UMUT-PC Online` gostergesi. */
export function StatusHeader({
  isOnline,
  isChecking,
  deviceName,
  title,
}: {
  isOnline: boolean;
  isChecking: boolean;
  deviceName: string | null;
  title?: string;
}) {
  const { t } = useApp();
  const label = isChecking ? t.checking : isOnline ? t.online : t.offline;

  return (
    <header className="flex items-end justify-between gap-3 px-4 pb-1 pt-6">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-[-0.02em]">{title ?? t.appName}</h1>
        <p className="mt-1.5 flex items-center gap-2 text-sm">
          <span
            aria-hidden
            data-live={isOnline && !isChecking ? "true" : "false"}
            className={cn(
              "signal-dot",
              isChecking ? "text-muted-foreground" : isOnline ? "text-success" : "text-danger",
            )}
          />
          <span className="num truncate text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {deviceName ?? "Computer"}
          </span>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="num text-xs uppercase tracking-[0.12em] text-foreground">{label}</span>
        </p>
      </div>
    </header>
  );
}
