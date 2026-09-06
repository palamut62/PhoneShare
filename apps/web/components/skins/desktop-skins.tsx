"use client";

/**
 * PC paneli gorunum stilleri (Ayarlar > Gorunum > PC paneli).
 *
 * Hepsi ayni gercek veriyi kullanir: health adresleri, eslesmis cihazlar ve
 * aktarim gecmisi. Sahte telemetri gosterilmez; olcumu olmayan alan hic
 * cizilmez. Gercek Windows yollari istemciye gelmez (PRD §93), bu yuzden
 * hicbir stil disk yolu gostermez.
 */

import { ChevronRight, QrCode, ShieldCheck, Smartphone, Wifi } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { formatBytes } from "@/lib/upload/speed";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

import type { DesktopSkinProps } from "./types";

function DeviceRows({
  devices,
  onSelectDevice,
  compact = false,
}: Pick<DesktopSkinProps, "devices" | "onSelectDevice"> & { compact?: boolean }) {
  if (devices.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">No paired phone yet.</p>;
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      {devices.map((device) => (
        <button
          key={device.id}
          type="button"
          onClick={() => onSelectDevice(device.id, device.name)}
          className={cn(
            "flex items-center gap-3 rounded-xl bg-muted px-3 text-left hover:bg-border",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "min-h-12" : "min-h-14",
          )}
        >
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Smartphone aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{device.name}</span>
            <span className="block text-xs text-muted-foreground">Paired - open to manage</span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}

function StatusPill({ isOnline }: { isOnline: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden
        className={cn("h-2 w-2 rounded-full", isOnline ? "bg-success" : "bg-muted-foreground")}
      />
      <span className={isOnline ? "text-success" : "text-muted-foreground"}>
        {isOnline ? "Online" : "Offline"}
      </span>
    </span>
  );
}

/** Masaustu 1 — Kompakt tepsi penceresi: en dar, tek bakista durum. */
export function DesktopTraySkin({
  deviceName,
  isOnline,
  devices,
  transfers,
  onAddDevice,
  onSelectDevice,
  locale,
}: DesktopSkinProps) {
  const last = transfers[0];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-3 px-4 py-6">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{deviceName ?? "PhoneShare"}</p>
            <p className="text-xs text-muted-foreground">Tray companion</p>
          </div>
          <StatusPill isOnline={isOnline} />
        </div>

        <div className="mt-3">
          <DeviceRows devices={devices} onSelectDevice={onSelectDevice} compact />
        </div>

        {last ? (
          <div className="mt-3 rounded-xl border border-border p-3">
            <p className="text-[11px] uppercase text-muted-foreground">Last received</p>
            <p className="mt-0.5 truncate text-sm font-medium">{last.original_filename}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(last.size, locale)} · {formatDateTime(last.started_at, locale)}
            </p>
          </div>
        ) : null}

        <Button size="lg" className="mt-3 w-full" onClick={onAddDevice}>
          <QrCode aria-hidden className="h-4 w-4" />
          Add New Phone
        </Button>
      </Card>
    </main>
  );
}

/** Masaustu 2 — Pro komuta merkezi: uc kolonlu genis yonetim gorunumu. */
export function DesktopCommandSkin({
  deviceName,
  isOnline,
  version,
  addresses,
  devices,
  transfers,
  onAddDevice,
  onSelectDevice,
  locale,
}: DesktopSkinProps) {
  const completed = transfers.filter((transfer) => transfer.status === "COMPLETED");
  const receivedBytes = completed.reduce((sum, transfer) => sum + transfer.size, 0);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{deviceName ?? "PhoneShare"} · Command Center</h1>
          <p className="text-sm text-muted-foreground">
            Receiver {version ? `v${version}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill isOnline={isOnline} />
          <Button onClick={onAddDevice}>
            <QrCode aria-hidden className="h-4 w-4" />
            Add New Phone
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>CONNECTION PATHS</CardTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {addresses.length === 0 ? (
              <li className="text-sm text-muted-foreground">No published address.</li>
            ) : (
              addresses.map((address) => (
                <li key={address.url} className="rounded-xl bg-muted p-2.5">
                  <div className="flex items-center gap-2">
                    <Wifi aria-hidden className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium uppercase text-muted-foreground">
                      {address.label}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs">{address.url}</p>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <CardTitle>PAIRED PHONES</CardTitle>
          <DeviceRows devices={devices} onSelectDevice={onSelectDevice} />
          <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-muted p-2">
              <dt className="text-[11px] uppercase text-muted-foreground">Recent files</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">{completed.length}</dd>
            </div>
            <div className="rounded-xl bg-muted p-2">
              <dt className="text-[11px] uppercase text-muted-foreground">Recent volume</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatBytes(receivedBytes, locale)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardTitle>LATEST TRANSFERS</CardTitle>
          {transfers.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No transfers yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {transfers.slice(0, 8).map((transfer) => (
                <li key={transfer.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{transfer.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(transfer.size, locale)} ·{" "}
                      {formatDateTime(transfer.started_at, locale)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      transfer.status === "COMPLETED"
                        ? "text-success"
                        : transfer.status === "FAILED"
                          ? "text-danger"
                          : "text-muted-foreground",
                    )}
                  >
                    {transfer.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}

/** Masaustu 5 — Guvenlik kulesi: eslestirme ve yetkili cihaz odakli gorunum. */
export function DesktopSecuritySkin({
  deviceName,
  isOnline,
  addresses,
  devices,
  transfers,
  onAddDevice,
  onSelectDevice,
  locale,
}: DesktopSkinProps) {
  const phoneAddress = addresses.find((address) => address.reachable_from_phone);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-4 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">
            <ShieldCheck aria-hidden className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Security &amp; Pairing</h1>
            <p className="text-sm text-muted-foreground">{deviceName ?? "PhoneShare"}</p>
          </div>
        </div>
        <StatusPill isOnline={isOnline} />
      </header>

      <Card className="border-primary/40 bg-primary/5">
        <CardTitle className="text-foreground">PAIRING</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Pairing codes can only be generated on this computer and expire in 5 minutes.
        </p>
        {phoneAddress ? (
          <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{phoneAddress.url}</p>
        ) : null}
        <Button size="lg" className="mt-3" onClick={onAddDevice}>
          <QrCode aria-hidden className="h-4 w-4" />
          Add New Phone
        </Button>
      </Card>

      <Card>
        <CardTitle>AUTHORIZED PHONES</CardTitle>
        <DeviceRows devices={devices} onSelectDevice={onSelectDevice} />
      </Card>

      <Card>
        <CardTitle>RECENT ACTIVITY</CardTitle>
        {transfers.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No transfers yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {transfers.slice(0, 10).map((transfer) => (
              <li key={transfer.id} className="flex gap-2 rounded-lg bg-muted px-2 py-1.5">
                <span className="shrink-0 text-muted-foreground">
                  {formatDateTime(transfer.started_at, locale)}
                </span>
                <span
                  className={cn(
                    "shrink-0",
                    transfer.status === "COMPLETED"
                      ? "text-success"
                      : transfer.status === "FAILED"
                        ? "text-danger"
                        : "text-muted-foreground",
                  )}
                >
                  [{transfer.status}]
                </span>
                <span className="min-w-0 truncate">{transfer.original_filename}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}
