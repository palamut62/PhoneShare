"use client";

import type { TransferResponse } from "@phoneshare/shared-types";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { StatusHeader } from "@/components/status-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { useHealth, useTransfers } from "@/hooks/use-receiver";
import { formatBytes } from "@/lib/upload/speed";
import { dayLabel, formatDateTime } from "@/lib/utils";

export default function TransfersPage() {
  const { t, locale } = useApp();
  const { isOnline, isChecking, deviceName } = useHealth();
  const router = useRouter();
  const [rawQuery, setRawQuery] = React.useState("");
  const [query, setQuery] = React.useState("");

  // PRD §41 — arama; yazarken istek yagmuru olmasin diye geciktirilir.
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const transfers = useTransfers({ q: query || undefined, limit: 100 });
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
              placeholder="File name, target, date…"
              className="pl-9"
              type="search"
            />
          </div>
        </div>

        {groups.length === 0 ? (
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
                          onClick={() => router.push("/")}
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
