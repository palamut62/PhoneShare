"use client";

import { Camera, CloudOff, FilePlus2, ImageUp, Plus, Smartphone, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { AppShell, useOpenPairDialog } from "@/components/app-shell";
import { FileReview } from "@/components/file-review";
import { InstallGuide } from "@/components/install-guide";
import { QueuePanel } from "@/components/queue-panel";
import { StatusHeader } from "@/components/status-header";
import { TargetPicker } from "@/components/target-picker";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import {
  useDevices,
  useHealth,
  useReceiverEvents,
  useReceiverSettings,
  useTargets,
  useTransfers,
} from "@/hooks/use-receiver";
import { useUploadQueue } from "@/hooks/use-upload-queue";
import { formatBytes } from "@/lib/upload/speed";
import { formatDateTime } from "@/lib/utils";

export default function HomePage() {
  return (
    <AppShell>
      <HomeScreen />
    </AppShell>
  );
}

function HomeScreen() {
  const { t, locale, preferences, savePreferences } = useApp();
  const { isOnline, isChecking, deviceName } = useHealth();
  useReceiverEvents();

  const openPairDialog = useOpenPairDialog();
  const devicesQuery = useDevices();
  const deviceCount = devicesQuery.data?.length ?? 0;

  const targetsQuery = useTargets();
  const settingsQuery = useReceiverSettings();
  const transfersQuery = useTransfers({ limit: 5 });

  const targets = React.useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);
  const queue = useUploadQueue(deviceName, settingsQuery.data?.max_file_bytes);

  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<File[]>([]);
  const [sendMenuOpen, setSendMenuOpen] = React.useState(false);
  // Dosya tutamaci kaybolmus (sayfa yenilenmis) bir FAILED oge icin manuel yeniden
  // deneme akisi: dosya secici acilir, secilen dosya bu id'ye baglanir.
  const [pendingRetryId, setPendingRetryId] = React.useState<string | null>(null);

  // PRD §22/§73 — son kullanilan hedefi hatirla.
  React.useEffect(() => {
    if (targetId !== null) return;
    if (preferences.rememberLastTarget && preferences.lastTargetId) {
      setTargetId(preferences.lastTargetId);
      return;
    }
    const favorite = targets.find((target) => target.favorite && target.enabled);
    if (favorite) setTargetId(favorite.id);
  }, [targets, preferences.rememberLastTarget, preferences.lastTargetId, targetId]);

  const fileInput = React.useRef<HTMLInputElement | null>(null);
  const photoInput = React.useRef<HTMLInputElement | null>(null);
  const cameraInput = React.useRef<HTMLInputElement | null>(null);

  const send = React.useCallback(
    (files: File[], chosenTarget: string | null) => {
      if (files.length === 0) return;
      queue.enqueue(files, chosenTarget);
      queue.start();
      if (preferences.rememberLastTarget && chosenTarget) {
        void savePreferences({ lastTargetId: chosenTarget });
      }
    },
    [queue, preferences.rememberLastTarget, savePreferences],
  );

  const onFilesPicked = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      // Dosya tutamaci kaybolmus bir FAILED ogenin yeniden denemesi: yeni bir kuyruk
      // ogesi olusturmadan secilen dosya orijinal ogeye baglanir.
      if (pendingRetryId) {
        const retryId = pendingRetryId;
        setPendingRetryId(null);
        queue.retry(retryId, files[0]);
        return;
      }
      // PRD §23 — Hizli Gonder: onay ekrani atlanir.
      if (preferences.quickSend && targetId && isOnline) {
        send(files, targetId);
        return;
      }
      setPending(files);
    },
    [pendingRetryId, queue, preferences.quickSend, targetId, isOnline, send],
  );

  return (
    <>
      <StatusHeader isOnline={isOnline} isChecking={isChecking} deviceName={deviceName} />

      <div className="flex flex-col gap-4 px-4 py-4">
        {!isOnline && !isChecking ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/10 p-3"
          >
            <CloudOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-sm text-foreground">
              The computer is offline. It must be online to receive files. You can select files now and send them
              when the computer is available.
            </p>
          </div>
        ) : null}

        {/* PRD §12/§67 — telefon ekleme yolu ana ekranda HER ZAMAN gorunur.
            Cihaz listesi alinamazsa (PC panelinde token yok -> 401) bile eslestirme
            girisi kaybolmaz; yalnizca sayi gosterilmez. */}
        {!devicesQuery.isSuccess || deviceCount === 0 ? (
          <Card className="border-primary/40 bg-primary/5">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-primary/10 p-2 text-primary">
                <Smartphone aria-hidden className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-foreground">{t.noDeviceTitle}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{t.noDeviceHint}</p>
              </div>
            </div>
            <Button size="lg" className="mt-3" onClick={openPairDialog}>
              <Smartphone aria-hidden className="h-4 w-4" />
              {t.addDevice}
            </Button>
          </Card>
        ) : (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>{t.deviceCount.replace("{count}", String(deviceCount))}</span>
            <button
              type="button"
              onClick={openPairDialog}
              className="flex min-h-11 items-center rounded-xl px-2 font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.addDevice}
            </button>
          </div>
        )}

        <InstallGuide />

        {/* PRD §74 — hizli gonderim presetleri; tiklayinca hedef atanir ve dosya secici acilir. */}
        {preferences.presets.length > 0 ? (
          <div aria-label={t.presets} className="-mx-4 overflow-x-auto px-4 pb-1">
            <div className="flex w-max gap-2">
              {preferences.presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (preset.targetId) setTargetId(preset.targetId);
                    // Hizli Gonder aciksa onFilesPicked zaten otomatik gonderim yapar.
                    fileInput.current?.click();
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden>{preset.emoji}</span>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <Card>
          <TargetPicker
            targets={targets}
            value={targetId}
            onChange={(next) => {
              setTargetId(next);
              if (preferences.rememberLastTarget) void savePreferences({ lastTargetId: next });
            }}
            label={t.target}
          />
        </Card>

        {queue.resumedNotice ? (
          <div role="status" className="rounded-2xl border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm text-foreground">{queue.resumedNotice}</p>
          </div>
        ) : null}

        <QueuePanel
          items={queue.items}
          summary={queue.summary}
          onCancel={queue.cancel}
          onRetry={(id) => {
            if (!queue.retry(id)) {
              setPendingRetryId(id);
              fileInput.current?.click();
            }
          }}
          onClear={queue.clearFinished}
          locale={locale}
        />

        <Card>
          <CardTitle>{t.recentTransfers}</CardTitle>
          {transfersQuery.data && transfersQuery.data.items.length > 0 ? (
            <ul className="mt-2 flex flex-col divide-y divide-border">
              {transfersQuery.data.items.slice(0, 5).map((transfer) => (
                <li key={transfer.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{transfer.original_filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(transfer.size, locale)} · {formatDateTime(transfer.started_at, locale)}
                    </p>
                  </div>
                  <span
                    className={
                      transfer.status === "COMPLETED"
                        ? "text-sm text-success"
                        : transfer.status === "FAILED"
                          ? "text-sm text-danger"
                          : "text-sm text-muted-foreground"
                    }
                    aria-label={transfer.status}
                  >
                    {transfer.status === "COMPLETED" ? "✓" : transfer.status === "FAILED" ? "✕" : "…"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">{t.noTransfers}</p>
          )}
          <Link
            href="/transfers"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View all →
          </Link>
        </Card>
      </div>

      {/* PRD §15-§17 — dosya, fotograf ve kamera girisleri. */}
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onFilesPicked}
      />
      <input
        ref={photoInput}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onFilesPicked}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onFilesPicked}
      />

      {/* PRD §70 — tek elle erisilen, icerigi kapatmayan gonderim menusu. */}
      {sendMenuOpen ? (
        <button
          type="button"
          aria-label="Close send menu"
          className="fixed inset-0 z-20 bg-black/10"
          onClick={() => setSendMenuOpen(false)}
        />
      ) : null}
      <div
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-2 md:bottom-6 md:right-6"
      >
        {sendMenuOpen ? (
          <div className="flex flex-col items-end gap-2" role="menu" aria-label="Send options">
            {[
              {
                label: "Choose File",
                icon: FilePlus2,
                action: () => fileInput.current?.click(),
              },
              { label: t.sendPhoto, icon: ImageUp, action: () => photoInput.current?.click() },
              { label: t.takePhoto, icon: Camera, action: () => cameraInput.current?.click() },
            ].map(({ label, icon: Icon, action }) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-surface px-4 font-semibold text-foreground shadow-lg"
                onClick={() => {
                  setSendMenuOpen(false);
                  action();
                }}
              >
                <Icon aria-hidden className="h-5 w-5 text-primary" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          aria-label={sendMenuOpen ? "Close send menu" : "Send a file or photo"}
          aria-expanded={sendMenuOpen}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => setSendMenuOpen((open) => !open)}
        >
          {sendMenuOpen ? <X aria-hidden className="h-6 w-6" /> : <Plus aria-hidden className="h-7 w-7" />}
        </button>
      </div>

      <FileReview
        files={pending}
        targets={targets}
        targetId={targetId}
        onTargetChange={setTargetId}
        onRemove={(index) => setPending((current) => current.filter((_, i) => i !== index))}
        onCancel={() => setPending([])}
        onConfirm={() => {
          send(pending, targetId);
          setPending([]);
        }}
        isOnline={isOnline}
        deviceName={deviceName}
        locale={locale}
      />
    </>
  );
}
