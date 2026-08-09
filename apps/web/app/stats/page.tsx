"use client";

import type { StatsResponse } from "@phoneshare/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";
import { StatusHeader } from "@/components/status-header";
import { Card, CardTitle } from "@/components/ui/card";
import { useHealth, useReceiverEvents, useStats } from "@/hooks/use-receiver";
import { formatBytes, formatSpeed } from "@/lib/upload/speed";

export default function StatsPage() {
  return (
    <AppShell>
      <StatsScreen />
    </AppShell>
  );
}

function StatsScreen() {
  const { t, locale } = useApp();
  const { isOnline, isChecking, deviceName } = useHealth();
  const queryClient = useQueryClient();
  // PRD §43 — yeni transfer (WS "transfer.*") gelince istatistikler tazelenir.
  useReceiverEvents(() => {
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  });

  const statsQuery = useStats();
  const stats = statsQuery.data;

  const topTargets = React.useMemo(
    () =>
      (stats?.top_targets ?? []).map((item) => ({
        id: item.target_id,
        name: item.name,
        files: item.files,
        bytes: item.bytes,
      })),
    [stats],
  );
  const fileTypes = React.useMemo(
    () =>
      (stats?.file_types ?? []).map((item) => ({
        id: item.mime_type,
        name: item.mime_type,
        files: item.files,
        bytes: item.bytes,
      })),
    [stats],
  );
  const devices = React.useMemo(
    () =>
      (stats?.by_device ?? []).map((item) => ({
        id: item.device_id,
        name: item.name,
        files: item.files,
        bytes: item.bytes,
      })),
    [stats],
  );

  return (
    <>
      <StatusHeader isOnline={isOnline} isChecking={isChecking} deviceName={deviceName} title={t.stats} />

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* PRD §42 — KPI kartlari: Bugun / Hafta / Ay / Toplam. */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label={t.today} avgSpeedLabel={t.avgSpeed} period={stats?.today} isLoading={statsQuery.isLoading} locale={locale} />
          <KpiCard label={t.week} avgSpeedLabel={t.avgSpeed} period={stats?.week} isLoading={statsQuery.isLoading} locale={locale} />
          <KpiCard label={t.month} avgSpeedLabel={t.avgSpeed} period={stats?.month} isLoading={statsQuery.isLoading} locale={locale} />
          <KpiCard label={t.allTime} avgSpeedLabel={t.avgSpeed} period={stats?.total} isLoading={statsQuery.isLoading} locale={locale} />
        </div>

        <Card>
          <CardTitle>{t.last14Days}</CardTitle>
          {statsQuery.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">…</p>
          ) : !stats || stats.daily.every((point) => point.files === 0) ? (
            <p className="mt-3 text-sm text-muted-foreground">{t.noStats}</p>
          ) : (
            <DailyChart daily={stats.daily} label={t.last14Days} />
          )}
        </Card>

        <DistributionCard title={t.topTargets} items={topTargets} />
        <DistributionCard title={t.fileTypes} items={fileTypes} />
        <DistributionCard title={t.byDevice} items={devices} />
      </div>
    </>
  );
}

/** KPI kart: dosya sayisi (hero) + toplam boyut + varsa ortalama hiz. */
function KpiCard({
  label,
  avgSpeedLabel,
  period,
  isLoading,
  locale,
}: {
  label: string;
  avgSpeedLabel: string;
  period: StatsResponse["today"] | undefined;
  isLoading: boolean;
  locale: string;
}) {
  return (
    <Card className="flex flex-col gap-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{isLoading || !period ? "…" : period.files.toLocaleString(locale)}</p>
      <p className="text-xs text-muted-foreground">{!period ? "—" : formatBytes(period.bytes, locale)}</p>
      {period?.avg_speed != null ? (
        <p className="text-xs text-muted-foreground">
          {avgSpeedLabel}: {formatSpeed(period.avg_speed, locale)}
        </p>
      ) : null}
    </Card>
  );
}

/** PRD §42 — yalnizca CSS bar chart; kutuphane yok. Tek seri (gunluk dosya sayisi). */
function DailyChart({ daily, label }: { daily: StatsResponse["daily"]; label: string }) {
  const maxFiles = daily.reduce((max, point) => Math.max(max, point.files), 0);
  return (
    <div className="mt-4" role="img" aria-label={label}>
      <div className="flex h-40 items-end gap-1.5 border-b border-border">
        {daily.map((point) =>
          point.files > 0 ? (
            <div
              key={point.date}
              title={`${point.date}: ${point.files}`}
              className="min-w-2 flex-1 rounded-t bg-primary"
              style={{ height: `${Math.max((point.files / maxFiles) * 100, 4)}%` }}
            />
          ) : (
            // Bos gun: ince muted cizgi.
            <div key={point.date} className="flex min-w-2 flex-1 items-end justify-center">
              <span className="h-1.5 w-[3px] rounded-t bg-muted" />
            </div>
          ),
        )}
      </div>
      <div className="flex gap-1.5">
        {daily.map((point) => (
          <span
            key={point.date}
            className="min-w-2 flex-1 truncate pt-1.5 text-center text-[10px] text-muted-foreground"
          >
            {shortDay(point.date)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "2026-08-08" → "8/8" (kisa gun etiketi). */
function shortDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

/** Dagitim satiri: sol kisimda oran cubugu, sagda isim + dosya sayisi + boyut. */
function DistributionCard({
  title,
  items,
}: {
  title: string;
  items: { id: string; name: string; files: number; bytes: number }[];
}) {
  const { t, locale } = useApp();
  const max = items.reduce((max, item) => Math.max(max, item.files), 0);
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div aria-hidden className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(item.files / max) * 100}%` }} />
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {item.files} {t.files} · {formatBytes(item.bytes, locale)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

