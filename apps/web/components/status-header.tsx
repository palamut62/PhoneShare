"use client";

import { useApp } from "@/components/app-providers";

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
    <header className="flex items-center justify-between gap-3 px-4 pt-5">
      <div>
        <h1 className="text-xl font-semibold">{title ?? t.appName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {deviceName ?? "Computer"} · <span className="font-medium text-foreground">{label}</span>
        </p>
      </div>
    </header>
  );
}
