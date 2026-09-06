"use client";

import type { TransferResponse } from "@phoneshare/shared-types";
import { Copy, Search } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";
import { StatusHeader } from "@/components/status-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useHealth, useTransfers } from "@/hooks/use-receiver";
import { formatBytes } from "@/lib/upload/speed";
import { dayLabel, formatDateTime } from "@/lib/utils";

export default function TransfersPage() {
  return (
    <AppShell>
      <TransfersScreen />
    </AppShell>
  );
}

function TransfersScreen() {
  const { t, locale } = useApp();
  const { isOnline, isChecking, deviceName } = useHealth();
  const [rawQuery, setRawQuery] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [offset, setOffset] = React.useState(0);
  const limit = 50;

  // PRD §41 — arama; yazarken istek yagmuru olmasin diye geciktirilir.
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  React.useEffect(() => setOffset(0), [query]);

  const transfers = useTransfers({ q: query || undefined, limit, offset });
  const groups = React.useMemo(() => groupByDay(transfers.data?.items ?? [], locale), [transfers.data, locale]);

  return (
    <>
      <StatusHeader isOnline={isOnline} isChecking={isChecking} deviceName={deviceName} title={t.transfers} />

      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-search">{t.search}</Label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="transfer-search"
              value={rawQuery}
              onChange={(event) => setRawQuery(event.target.value)}
              placeholder="Search file name"
              className="pl-9"
              type="search"
            />
          </div>
        </div>

        {transfers.isError ? (
          <Card>
            <p role="alert" className="text-sm text-danger">Transfers could not be loaded.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void transfers.refetch()}>{t.retry}</Button>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <p className="text-sm text-muted-foreground">{t.noTransfers}</p>
          </Card>
        ) : null}

        {groups.map(([label, items]) => (
          <section key={label} aria-label={label}>
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </h2>
            <Card className="mt-2 p-0">
              <ul className="flex flex-col divide-y divide-border">
                {items.map((transfer) => (
                  <li key={transfer.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{transfer.original_filename}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatBytes(transfer.size, locale)} · {formatDateTime(transfer.started_at, locale)}
                      </p>
                      {transfer.status === "FAILED" ? (
                        <p className="mt-1 text-xs text-danger">Transfer failed.</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        aria-label={`Copy ${transfer.original_filename}`}
                        className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => void navigator.clipboard?.writeText(transfer.original_filename)}
                      >
                        <Copy aria-hidden className="h-4 w-4" />
                      </button>
                      <span
                        className={
                          transfer.status === "COMPLETED"
                            ? "text-sm text-success"
                            : transfer.status === "FAILED"
                              ? "text-sm text-danger"
                              : "text-sm text-muted-foreground"
                        }
                      >
                        {transfer.status === "COMPLETED" ? "✓" : transfer.status === "FAILED" ? "✕" : "…"}
                        <span className="sr-only">{transfer.status}</span>
                      </span>
                      {transfer.status === "FAILED" ? (
                        // PRD §39 — dosya icerigi tarayicida saklanmadigi icin yeniden secim gerekir.
                        <Button
                          variant="secondary"
                          className="min-h-11 text-xs"
                          onClick={() => (window.location.href = "/")}
                        >
                          {t.retry}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))}
        {transfers.data && (offset > 0 || transfers.data.items.length === limit) ? (
          <div className="flex justify-between gap-3">
            <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - limit))}>Previous</Button>
            <Button variant="secondary" disabled={transfers.data.items.length < limit} onClick={() => setOffset((current) => current + limit)}>Next</Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function groupByDay(items: TransferResponse[], locale: string): [string, TransferResponse[]][] {
  const groups = new Map<string, TransferResponse[]>();
  for (const item of items) {
    const label = dayLabel(item.started_at, locale);
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }
  return [...groups.entries()];
}
