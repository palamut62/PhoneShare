"use client";

import {
  qrPayloadSchema,
  type PairStartResponse,
  type QrPayload,
  type ReceiverAddress,
} from "@phoneshare/shared-types";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Loader2, X } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { startPairing } from "@/lib/api/client";
import { applyAddressOverride, preferredAddress } from "@/lib/pair-address";
import { getPairAddress, getTailscaleStatus, isTauri, type PairAddress } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type DialogStatus = "loading" | "ready" | "error";

/** Panoya kopyala; clipboard API yoksa gizli textarea ile fallback dener. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

interface PairDeviceDialogProps {
  open: boolean;
  onClose: () => void;
}

/** "Yeni Telefon Ekle" — QR kodu + adim adim baglanti rehberi (PRD §12). */
export function PairDeviceDialog({ open, onClose }: PairDeviceDialogProps) {
  const { t } = useApp();
  const [status, setStatus] = React.useState<DialogStatus>("loading");
  const [ticket, setTicket] = React.useState<PairStartResponse | null>(null);
  const [payload, setPayload] = React.useState<QrPayload | null>(null);
  const [override, setOverride] = React.useState<PairAddress | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [tailscale, setTailscale] = React.useState<{ dnsName: string | null } | null>(null);
  const [copied, setCopied] = React.useState<"code" | "address" | null>(null);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = React.useCallback(async () => {
    setStatus("loading");
    setCopied(null);
    try {
      const [freshTicket, address] = await Promise.all([startPairing(), getPairAddress()]);
      const parsed = qrPayloadSchema.safeParse(JSON.parse(freshTicket.qr_payload));
      if (!parsed.success) throw new Error("gecersiz qr icerik");
      setTicket(freshTicket);
      setPayload(parsed.data);
      setOverride(address);
      // Receiver adaylari sirali gonderir: telefonun erisebilecegi ilk adres secilir.
      setSelected(preferredAddress(freshTicket.addresses)?.url ?? null);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Adim "Tailscale" yalnizca Tauri panelinde, uzaktan erisim acikken gosterilir.
  React.useEffect(() => {
    if (!isTauri()) return;
    void getTailscaleStatus().then((result) => {
      if (result?.remote_enabled) setTailscale({ dnsName: result.dns_name ?? null });
    });
  }, []);

  const copy = React.useCallback(async (value: string, key: "code" | "address") => {
    if (await copyText(value)) {
      setCopied(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  const addresses = ticket?.addresses ?? [];
  const current = addresses.find((item) => item.url === selected) ?? null;
  // Adres onceligi: secilen aday > QR icerigi. Tauri (Tailscale) override'i her
  // durumda scheme + host + PORT'u birlikte degistirir.
  const activeUrl = applyAddressOverride(current?.url ?? payload?.url ?? "", override);
  const addressLabel = React.useCallback(
    (item: ReceiverAddress) =>
      item.kind === "lan"
        ? t.pairAddressLan
        : item.kind === "tailscale"
          ? t.pairAddressTailscale
          : t.pairAddressLoopback,
    [t],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.addDevice}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <Card
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base text-foreground">{t.addDevice}</CardTitle>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 aria-hidden className="h-7 w-7 animate-spin" />
            <p className="text-sm">{t.checking}</p>
          </div>
        ) : status === "error" ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3">
            <p className="text-sm text-danger">{t.pairError}</p>
            <Button variant="secondary" onClick={() => void load()}>
              {t.retry}
            </Button>
          </div>
        ) : ticket && payload ? (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-medium text-foreground">{t.pairQrTitle}</p>
              <div className="rounded-2xl border border-border bg-white p-4">
                <QRCodeSVG value={activeUrl} size={220} fgColor="#000000" bgColor="#ffffff" />
              </div>
              <p className="text-center text-xs text-muted-foreground">{t.pairQrHint}</p>
            </div>

            {/* Birden fazla aday varsa kullanici yolu secer (PRD §47/§48). */}
            {addresses.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.pairAddressChoose}
                </p>
                <div role="radiogroup" aria-label={t.pairAddressChoose} className="flex flex-wrap gap-2">
                  {addresses.map((item) => {
                    const active = item.url === selected;
                    return (
                      <button
                        key={item.url}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={!item.reachable_from_phone}
                        onClick={() => setSelected(item.url)}
                        className={cn(
                          "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-surface text-foreground",
                          item.reachable_from_phone ? "" : "cursor-not-allowed opacity-50",
                        )}
                      >
                        {addressLabel(item)}
                      </button>
                    );
                  })}
                </div>
                {current && !current.reachable_from_phone ? (
                  <p className="text-xs text-danger">{t.pairAddressUnreachable}</p>
                ) : null}
              </div>
            ) : null}

            {addresses.length > 0 && addresses.every((item) => !item.reachable_from_phone) ? (
              <p
                role="status"
                className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-foreground"
              >
                {t.pairAddressNoneHint}
              </p>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.pairCode}
                </p>
                <Button variant="ghost" size="md" className="min-h-9 px-2 text-xs" onClick={() => void copy(ticket.code, "code")}>
                  {copied === "code" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
                  {copied === "code" ? t.copied : t.copy}
                </Button>
              </div>
              <p className="rounded-xl border border-border bg-background px-3 py-2 text-center font-mono text-2xl tracking-widest">
                {ticket.code}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.pairAddress}
                </p>
                <Button variant="ghost" size="md" className="min-h-9 px-2 text-xs" onClick={() => void copy(activeUrl, "address")}>
                  {copied === "address" ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
                  {copied === "address" ? t.copied : t.copy}
                </Button>
              </div>
              <p className="truncate rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                {activeUrl}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t.stepsTitle}
              </p>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
                <li>{t.step1}</li>
                <li>
                  {t.step2}
                  <span className="mt-1 block break-all font-medium text-foreground">{activeUrl}</span>
                </li>
                <li>{t.step3}</li>
                {tailscale ? (
                  <li>
                    {t.step3Tailscale}
                    {tailscale.dnsName ? (
                      <span className="mt-1 block text-xs text-foreground">
                        {t.tailscaleActive.replace("{dns}", tailscale.dnsName)}
                      </span>
                    ) : null}
                  </li>
                ) : null}
              </ol>
              <p className="text-xs text-muted-foreground">{t.addToHomeTip}</p>
            </div>

            {/* PRD §71 — teknik hata metni yerine anlasilir kontrol listesi. */}
            <details className="rounded-xl border border-border bg-background p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {t.pairTroubleTitle}
              </summary>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                <li>{t.pairTrouble1}</li>
                <li>{t.pairTrouble2}</li>
                <li>{t.pairTrouble3}</li>
                <li>{t.pairTrouble4}</li>
              </ul>
            </details>

            <Button variant="ghost" className="self-end text-sm" onClick={() => void load()}>
              {t.refreshCode}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
