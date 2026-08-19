"use client";

import { MAX_CHUNK_SIZE, MIN_CHUNK_SIZE, PRODUCT_OWNER } from "@phoneshare/shared-config";
import type { RuleCreateRequest, RuleResponse, TargetResponse } from "@phoneshare/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderOpen, Github, Plus, Star, Trash2 } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { useOpenPairDialog } from "@/components/app-shell";
import { StatusHeader } from "@/components/status-header";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Toggle } from "@/components/ui/field";
import { useApps, useHealth, useReceiverSettings, useRules, useTargets } from "@/hooks/use-receiver";
import {
  createApp,
  createRule,
  createTarget,
  deleteApp,
  deleteRule,
  deleteTarget,
  removeDevice,
  updateRule,
  updateSettings,
  updateTarget,
} from "@/lib/api/client";
import type { Dictionary } from "@/lib/i18n";
import {
  ensureFolder,
  forgetTargetPath,
  getDesktopConfig,
  getTailscaleStatus,
  isTauri,
  openBaseFolder,
  pickFile,
  pickFolder,
  registerTargetPath,
  revealInExplorer,
  setRemoteAccess,
} from "@/lib/tauri";
import type { Language, ThemePreference } from "@/lib/storage/session";
import { formatBytes } from "@/lib/upload/speed";
import { cn, formatDateTime } from "@/lib/utils";

const CHUNK_OPTIONS = [1, 2, 4, 8, 16, 32].map((mb) => mb * 1024 * 1024).filter(
  (value) => value >= MIN_CHUNK_SIZE && value <= MAX_CHUNK_SIZE,
);

export default function SettingsPage() {
  const { t, locale, preferences, savePreferences, session, resetSession } = useApp();
  const { isOnline, isChecking, deviceName } = useHealth();
  const [confirmReset, setConfirmReset] = React.useState(false);
  const openPairDialog = useOpenPairDialog();

  const unpair = React.useCallback(async () => {
    if (session) {
      try {
        await removeDevice(session.token, session.deviceId);
      } catch {
        // Bilgisayara ulasilamasa bile yerel oturum temizlenir.
      }
    }
    await resetSession();
  }, [session, resetSession]);

  return (
    <>
      <StatusHeader isOnline={isOnline} isChecking={isChecking} deviceName={deviceName} title={t.settings} />

      <div className="stagger-in flex flex-col gap-3 px-4 py-4">
        <Card>
          <CardTitle>APPEARANCE</CardTitle>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="theme">{t.theme}</Label>
              <Select
                id="theme"
                value={preferences.theme}
                onChange={(event) => void savePreferences({ theme: event.target.value as ThemePreference })}
              >
                <option value="system">{t.system}</option>
                <option value="light">{t.light}</option>
                <option value="dark">{t.dark}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="language">{t.language}</Label>
              <Select
                id="language"
                value={preferences.language}
                onChange={(event) => void savePreferences({ language: event.target.value as Language })}
              >
                <option value="en">English</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>SENDING</CardTitle>
          <div className="mt-2 divide-y divide-border">
            <Toggle
              id="quick-send"
              checked={preferences.quickSend}
              onCheckedChange={(value) => void savePreferences({ quickSend: value })}
              label={t.quickSend}
              description={t.quickSendHint}
            />
            <Toggle
              id="remember-target"
              checked={preferences.rememberLastTarget}
              onCheckedChange={(value) => void savePreferences({ rememberLastTarget: value })}
              label={t.rememberTarget}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Label htmlFor="chunk-size">{t.chunkSize}</Label>
            <Select
              id="chunk-size"
              value={String(preferences.chunkSize)}
              onChange={(event) => void savePreferences({ chunkSize: Number(event.target.value) })}
            >
              {CHUNK_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {formatBytes(value, locale)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              The computer&apos;s preferred chunk size takes priority when available.
            </p>
          </div>
        </Card>

        <TargetsCard />

        <AppsCard />

        <PresetsCard />

        <RulesCard />

        <Card>
          <CardTitle>INFORMATION</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Files are transferred directly to your computer and are not stored on a PhoneShare cloud server.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Pending file contents are not stored in the browser after a refresh; select the files again.
          </p>
        </Card>

        <ConnectionCard />

        <Card>
          <CardTitle>DEVICE</CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Paired device: <strong className="text-foreground">{session?.deviceName ?? "—"}</strong>
          </p>
          <Button className="mt-3 w-full sm:w-auto" onClick={openPairDialog}>
            <Plus aria-hidden className="h-4 w-4" />
            {t.addDevice}
          </Button>
          {confirmReset ? (
            <div className="mt-3 rounded-lg bg-danger/10 p-3">
              <p className="text-sm text-foreground">
                This device will be unpaired and will require a new code. Continue?
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>
                  {t.cancel}
                </Button>
                <Button variant="danger" className="flex-1" onClick={() => void unpair()}>
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" className="mt-3" onClick={() => setConfirmReset(true)}>
              <Trash2 aria-hidden className="h-4 w-4" />
              {t.resetDevice}
            </Button>
          )}
        </Card>

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          <p>
            {t.owner}: <span className="font-medium text-foreground">Umut Çelik (palamut62)</span>
          </p>
          <div className="mt-2 flex items-center justify-center gap-4">
            <a
              href={PRODUCT_OWNER.x}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Product owner X profile"
            >
              <span aria-hidden className="text-base font-semibold">
                𝕏
              </span>
              @palamut62
            </a>
            <a
              href={PRODUCT_OWNER.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Product owner GitHub profile"
            >
              <Github aria-hidden className="h-4 w-4" />
              palamut62
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}

/** Phase 6 — baglanti bilgisi + Tailscale uzaktan erisim yonetimi. */
function ConnectionCard() {
  const { t } = useApp();
  const queryClient = useQueryClient();
  // SSR'da `window` yoktur; origin useEffect ile doldurulur.
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  const statusQuery = useQuery({
    queryKey: ["tailscale-status"],
    queryFn: getTailscaleStatus,
    refetchInterval: 15_000,
  });

  const remoteMutation = useMutation({
    mutationFn: (enabled: boolean) => setRemoteAccess(enabled),
    onSuccess: (result) => {
      if (result === null) return; // komut Err dondu; hata kutusu veriyi gosterir
      void queryClient.invalidateQueries({ queryKey: ["tailscale-status"] });
      void queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });

  const status = statusQuery.data;

  // Aktif uzak adres. Sekma: receiver_tls=true iken sertifika hep alinmis
  // demektir (https) — toggle cevabindaki https degeri onceliklidir.
  const activeUrl = React.useMemo(() => {
    if (!status?.remote_enabled) return null;
    let port = "";
    try {
      port = new URL(origin).port;
    } catch {
      // gecersiz origin — 8765 fallback kullanilir
    }
    const finalPort = port || "8765";
    const https = remoteMutation.data?.https ?? true;
    if (https && status.dns_name) return `https://${status.dns_name}:${finalPort}`;
    if (status.ipv4) return `http://${status.ipv4}:${finalPort}`;
    return null;
  }, [status, origin, remoteMutation.data]);

  // Tarayici: bilgi karti yalnizca — uzaktan erisim panelde yonetilir.
  if (!isTauri()) {
    return (
      <Card>
        <CardTitle>{t.connectionTitle}</CardTitle>
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t.connectionOrigin}: <span className="font-medium text-foreground">{origin || "—"}</span>
          </p>
          <p className="text-xs text-muted-foreground">{t.connectionDesktopNote}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>{t.connectionTitle}</CardTitle>

      {statusQuery.isLoading || !status ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.connectionChecking}</p>
      ) : !status.installed ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t.tailscaleNotInstalled}{" "}
          <a
            href="https://tailscale.com/download"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            tailscale.com/download
          </a>
        </p>
      ) : !status.running ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t.tailscaleNotRunning}</p>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => void statusQuery.refetch()}
          >
            {t.tailscaleCheckAgain}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {t.tailscaleDnsLabel}: <span className="num font-medium text-foreground">{status.dns_name ?? "—"}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            IPv4: <span className="num font-medium text-foreground">{status.ipv4 ?? "—"}</span>
          </p>
          <p className={cn("text-sm font-medium", status.remote_enabled ? "text-success" : "text-muted-foreground")}>
            {status.remote_enabled ? t.remoteActive : t.remoteInactive}
          </p>

          {/* GONDERIM kartindaki Toggle yapisi; mutasyon sirasinda disabled. */}
          <div className="flex items-start justify-between gap-4 py-1">
            <div className="min-w-0">
              <label htmlFor="remote-access" className="text-sm font-medium text-foreground">
                {t.remoteAccessToggle}
              </label>
              <p className="mt-1 text-xs text-muted-foreground">{t.remoteAccessHint}</p>
            </div>
            <button
              id="remote-access"
              type="button"
              role="switch"
              aria-checked={status.remote_enabled}
              aria-label={t.remoteAccessToggle}
              disabled={remoteMutation.isPending}
              onClick={() => remoteMutation.mutate(!status.remote_enabled)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "focus-visible:ring-offset-background disabled:opacity-50",
                status.remote_enabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform",
                  status.remote_enabled ? "translate-x-6" : "translate-x-0.5",
                )}
              />
            </button>
          </div>

          {remoteMutation.isPending || status.remote_enabled ? (
            <p className="text-xs text-muted-foreground">{t.remoteRestartNote}</p>
          ) : null}

          {activeUrl ? (
            <p className="text-xs text-muted-foreground">
              {t.remoteAddress}:{" "}
              <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-foreground num">
                {activeUrl}
              </span>
            </p>
          ) : null}

          {remoteMutation.data === null ? <p className="text-sm text-danger">{t.remoteError}</p> : null}

          {remoteMutation.data?.message ? (
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-sm text-foreground">{remoteMutation.data.message || t.remoteHttpsWarning}</p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{t.remoteQrNote}</p>
        </div>
      )}
    </Card>
  );
}

/**
 * PRD §20/§93 — hedef klasorler. Gercek Windows yolu API'de donmez; yol yalnizca
 * masaustu kabugunda (`register_target_path`) yerel olarak tutulur, bu yuzden
 * hedef bazli "Ac" butonu yoktur — kartin altinda tek bir ana klasor kisayolu vardir.
 */
function TargetsCard() {
  const { session } = useApp();
  const token = session?.token ?? "";
  const queryClient = useQueryClient();
  const targetsQuery = useTargets();
  const targets = React.useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);
  const desktop = isTauri();

  // Yerel config: ana klasor + hedef id -> gercek yol eslemesi (yalnizca masaustunde).
  const configQuery = useQuery({
    queryKey: ["desktop-config"],
    queryFn: getDesktopConfig,
    enabled: desktop,
  });
  const baseFolder = configQuery.data?.base_folder ?? null;
  const targetPaths = configQuery.data?.target_paths ?? {};

  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const invalidateTargets = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["targets"] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: async (label: string) => {
      // Native secici: kullanici vazgecerse sessizce cikilir.
      const picked = await pickFolder(
        baseFolder ? `Select a folder inside ${baseFolder}` : "Klasor secin",
      );
      if (!picked) return null;
      const normalized = await ensureFolder(picked);
      if (!normalized) throw new Error("folder");
      const segments = normalized.split(/[\\/]/).filter(Boolean);
      const finalName = label.trim() || segments[segments.length - 1] || "Target";
      const created = await createTarget(token, {
        name: finalName,
        path: normalized,
        favorite: false,
        enabled: true,
      });
      // Yol yalnizca yerelde saklanir; "Dosyayi Ac" bu kok altini kabul eder.
      await registerTargetPath(created.id, normalized);
      return created;
    },
    onSuccess: (created) => {
      if (created) setName("");
      setError(null);
      invalidateTargets();
      // target_paths degisti; yerel config'i tazele.
      void queryClient.invalidateQueries({ queryKey: ["desktop-config"] });
    },
    onError: () =>
      setError("The folder could not be added. Choose a folder inside the base folder."),
  });

  const updateMutation = useMutation({
    mutationFn: ({ target, patch }: { target: TargetResponse; patch: { favorite?: boolean; enabled?: boolean } }) =>
      updateTarget(token, target.id, patch),
    onSuccess: () => setError(null),
    onError: () => setError("The target could not be updated."),
    onSettled: invalidateTargets,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteTarget(token, id);
      await forgetTargetPath(id);
    },
    onSuccess: () => setError(null),
    onError: () => setError("The target could not be deleted."),
    onSettled: invalidateTargets,
  });

  const busy = addMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <Card>
      <CardTitle>TARGET FOLDERS</CardTitle>
      {desktop ? (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Incoming files are saved into these folders. New folders must be inside the base folder:
          <span className="rounded-md border border-border bg-background px-2 py-1 font-mono text-foreground num">
            {baseFolder ?? "—"}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          Incoming files are saved into these folders on your computer.
        </p>
      )}

      {targets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No target folders yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {targets.map((target) => {
            const targetPath = targetPaths[target.id];
            return (
            <li key={target.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{target.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {target.enabled ? "Active" : "Disabled"}
                </p>
              </div>
              {desktop && targetPath ? (
                <button
                  type="button"
                  aria-label={`${target.name} show in folder`}
                  disabled={busy}
                  onClick={() => void revealInExplorer(targetPath)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <FolderOpen aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
              {desktop ? (
                <button
                  type="button"
                  aria-label={`${target.name} favorite`}
                  aria-pressed={target.favorite}
                  disabled={busy}
                  onClick={() =>
                    updateMutation.mutate({ target, patch: { favorite: !target.favorite } })
                  }
                  className={cn(
                    "flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors",
                    "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:opacity-50",
                    target.favorite ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <Star aria-hidden className={cn("h-4 w-4", target.favorite && "fill-current")} />
                </button>
              ) : null}
              {desktop ? (
                <button
                  type="button"
                  role="switch"
                  aria-checked={target.enabled}
                  aria-label={target.name}
                  disabled={busy}
                  onClick={() =>
                    updateMutation.mutate({ target, patch: { enabled: !target.enabled } })
                  }
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-background disabled:opacity-50",
                    target.enabled ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform",
                      target.enabled ? "translate-x-6" : "translate-x-0.5",
                    )}
                  />
                </button>
              ) : null}
              {desktop ? (
                <button
                  type="button"
                  aria-label={`Delete ${target.name}`}
                  disabled={busy}
                  onClick={() => deleteMutation.mutate(target.id)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </li>
            );
          })}
        </ul>
      )}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {desktop ? (
        <div className="mt-3 flex flex-col gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Folder name (optional)"
            aria-label="Target folder name"
            maxLength={128}
          />
          <Button disabled={busy} onClick={() => addMutation.mutate(name)}>
            <Plus aria-hidden className="h-4 w-4" />
            Add Folder
          </Button>
          <Button variant="secondary" onClick={() => void openBaseFolder()}>
            <FolderOpen aria-hidden className="h-4 w-4" />
            Open base folder
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Target folders can only be added from the PhoneShare desktop app on your computer.
        </p>
      )}
    </Card>
  );
}

/**
 * Uzaktan baslatici — kayitli masaustu uygulamalari. Gercek exe yolu API'den
 * hicbir zaman gelmez ve burada gosterilmez. Ekleme/silme yalnizca masaustunde.
 */
function AppsCard() {
  const { session } = useApp();
  const token = session?.token ?? "";
  const queryClient = useQueryClient();
  const appsQuery = useApps();
  const apps = React.useMemo(() => appsQuery.data ?? [], [appsQuery.data]);
  const settingsQuery = useReceiverSettings();
  const desktop = isTauri();
  const [error, setError] = React.useState<string | null>(null);

  const invalidateApps = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["apps"] });
  }, [queryClient]);

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => updateSettings(token, { remote_launch_enabled: enabled }),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => setError("The setting could not be updated."),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const picked = await pickFile("Select an application (.exe) or shortcut (.lnk)");
      if (!picked) return null;
      const segments = picked.split(/[\\/]/).filter(Boolean);
      const fileName = segments[segments.length - 1] ?? "App";
      const name = fileName.replace(/\.(exe|lnk)$/i, "");
      return createApp(token, { name, exe_path: picked });
    },
    onSuccess: (created) => {
      if (!created) return;
      setError(null);
      invalidateApps();
    },
    onError: () => setError("The app could not be added. Only .exe or .lnk (shortcut) files can be selected."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteApp(token, id),
    onSuccess: () => setError(null),
    onError: () => setError("The app could not be deleted."),
    onSettled: invalidateApps,
  });

  const busy = addMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;
  const remoteLaunchEnabled = settingsQuery.data?.remote_launch_enabled ?? false;

  return (
    <Card>
      <CardTitle>REMOTE LAUNCH</CardTitle>

      {desktop ? (
        <div className="mt-2 divide-y divide-border">
          <Toggle
            id="remote-launch"
            checked={remoteLaunchEnabled}
            onCheckedChange={(value) => toggleMutation.mutate(value)}
            label="Allow remote launch"
            description="When enabled, paired phones can start the apps listed below."
          />
        </div>
      ) : null}

      {apps.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No apps added yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{app.name}</p>
                <p className="num mt-0.5 truncate text-xs text-muted-foreground">
                  {app.last_launched_at
                    ? `Last launched ${formatDateTime(app.last_launched_at)}`
                    : "Never launched"}
                </p>
              </div>
              {desktop ? (
                <button
                  type="button"
                  aria-label={`Delete ${app.name}`}
                  disabled={busy}
                  onClick={() => deleteMutation.mutate(app.id)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {desktop ? (
        <Button disabled={busy} className="mt-3" onClick={() => addMutation.mutate()}>
          <Plus aria-hidden className="h-4 w-4" />
          Add app
        </Button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Apps can only be added from the PhoneShare desktop app on your computer.
        </p>
      )}
    </Card>
  );
}

/** PRD §74 — hizli gonderim presetleri (yalnizca yerel tercih). */
function PresetsCard() {
  const { t, preferences, savePreferences } = useApp();
  const targetsQuery = useTargets();
  const targets = targetsQuery.data ?? [];

  const [emoji, setEmoji] = React.useState("");
  const [name, setName] = React.useState("");
  const [targetId, setTargetId] = React.useState("");

  const addPreset = React.useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [
      ...preferences.presets,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        emoji: emoji.trim() || "📁",
        targetId: targetId || null,
      },
    ];
    void savePreferences({ presets: next });
    setEmoji("");
    setName("");
    setTargetId("");
  }, [name, emoji, targetId, preferences.presets, savePreferences]);

  const removePreset = React.useCallback(
    (id: string) => {
      void savePreferences({ presets: preferences.presets.filter((preset) => preset.id !== id) });
    },
    [preferences.presets, savePreferences],
  );

  return (
    <Card>
      <CardTitle>{t.presets}</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">{t.presetHint}</p>

      {preferences.presets.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.noPresets}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {preferences.presets.map((preset) => {
            const target = targets.find((candidate) => candidate.id === preset.targetId);
            return (
              <li key={preset.id} className="flex items-center gap-3 py-2.5">
                <span aria-hidden className="text-xl">
                  {preset.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{preset.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {target ? target.name : "No target selected"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={t.deletePreset}
                  onClick={() => removePreset(preset.id)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Tek satir form: emoji + ad + hedef + ekle. */}
      <div className="mt-3 grid grid-cols-[4rem_minmax(0,1fr)_5.5rem_auto] gap-2">
        <Input
          value={emoji}
          onChange={(event) => setEmoji(event.target.value)}
          placeholder="📷"
          maxLength={4}
          aria-label={t.presetEmoji}
          className="text-center"
        />
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Site Photo"
          aria-label={t.presetName}
        />
        <Select value={targetId} onChange={(event) => setTargetId(event.target.value)} aria-label={t.target}>
          <option value="">No target selected</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </Select>
        <Button onClick={addPreset} disabled={!name.trim()} className="px-3">
          {t.addPreset}
        </Button>
      </div>
    </Card>
  );
}

type RuleMatchType = RuleCreateRequest["match_type"];

const MATCH_TYPES: readonly RuleMatchType[] = [
  "extension",
  "filename",
  "source",
  "size",
  "date",
  "tag",
];

function matchTypeLabel(type: RuleMatchType, t: Dictionary): string {
  switch (type) {
    case "extension":
      return t.matchTypeExtension;
    case "filename":
      return t.matchTypeFilename;
    case "source":
      return t.matchTypeSource;
    case "size":
      return t.matchTypeSize;
    case "date":
      return t.matchTypeDate;
    case "tag":
      return t.matchTypeTag;
  }
}

function matchValuePlaceholder(type: RuleMatchType, t: Dictionary): string {
  switch (type) {
    case "extension":
      return t.matchValueExtension;
    case "filename":
      return t.matchValueFilename;
    case "source":
      return t.matchValueSource;
    case "size":
      return t.matchValueSize;
    case "date":
      return t.matchValueDate;
    case "tag":
      return t.matchValueTag;
  }
}

/** PRD §33/§34 — klasor kurallari; ilk eslesen kural hedefi secer. */
function RulesCard() {
  const { t, session } = useApp();
  const queryClient = useQueryClient();
  const rulesQuery = useRules();
  const targetsQuery = useTargets();
  const sorted = React.useMemo(
    () => [...(rulesQuery.data ?? [])].sort((a, b) => a.priority - b.priority),
    [rulesQuery.data],
  );
  const targets = React.useMemo(() => targetsQuery.data ?? [], [targetsQuery.data]);

  const [name, setName] = React.useState("");
  const [matchType, setMatchType] = React.useState<RuleMatchType>("extension");
  const [matchValue, setMatchValue] = React.useState("");
  const [targetId, setTargetId] = React.useState("");
  const [conflictPolicy, setConflictPolicy] =
    React.useState<RuleCreateRequest["conflict_policy"]>("rename");
  const [rename, setRename] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Hedef listesi gelince ilk hedef varsayilan secilir; kural hedefsiz olamaz.
  React.useEffect(() => {
    const first = targets[0];
    if (!targetId && first) setTargetId(first.id);
  }, [targets, targetId]);

  const invalidateRules = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["rules"] });
  }, [queryClient]);

  const addMutation = useMutation({
    mutationFn: (payload: RuleCreateRequest) => createRule(session?.token ?? "", payload),
    onSuccess: () => {
      invalidateRules();
      setName("");
      setMatchValue("");
      setRename("");
      setError(null);
    },
    onError: () => setError(t.rulesSaveFailed),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: RuleResponse) =>
      updateRule(session?.token ?? "", rule.id, { enabled: !rule.enabled }),
    onSettled: invalidateRules,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRule(session?.token ?? "", id),
    onSettled: invalidateRules,
  });

  const swapMutation = useMutation({
    mutationFn: async ({ a, b }: { a: RuleResponse; b: RuleResponse }) => {
      const token = session?.token ?? "";
      await updateRule(token, a.id, { priority: b.priority });
      await updateRule(token, b.id, { priority: a.priority });
    },
    onSettled: invalidateRules,
  });

  const busy =
    addMutation.isPending ||
    toggleMutation.isPending ||
    deleteMutation.isPending ||
    swapMutation.isPending;

  const addRule = React.useCallback(() => {
    const trimmedName = name.trim();
    const trimmedValue = matchValue.trim();
    const target = targetId || targets[0]?.id;
    if (!trimmedName || !trimmedValue || !target) return;
    addMutation.mutate({
      name: trimmedName,
      match_type: matchType,
      match_value: trimmedValue,
      target_id: target,
      conflict_policy: conflictPolicy,
      rename: rename.trim() || null,
      enabled: true,
    });
  }, [name, matchValue, targetId, targets, matchType, conflictPolicy, rename, addMutation]);

  const move = React.useCallback(
    (index: number, direction: -1 | 1) => {
      const current = sorted[index];
      const neighbor = sorted[index + direction];
      if (!current || !neighbor) return;
      swapMutation.mutate({ a: current, b: neighbor });
    },
    [sorted, swapMutation],
  );

  return (
    <Card>
      <CardTitle>{t.rules}</CardTitle>
      <p className="mt-1 text-xs text-muted-foreground">{t.rulesHint}</p>

      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.noRules}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {sorted.map((rule, index) => {
            const target = targets.find((candidate) => candidate.id === rule.target_id);
            return (
              <li key={rule.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{rule.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {matchTypeLabel(rule.match_type, t)} · {rule.match_value}
                    {" · "}
                    {target ? target.name : t.targetDeleted}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={rule.name}
                  disabled={busy}
                  onClick={() => toggleMutation.mutate(rule)}
                  className={cn(
                    "relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    "focus-visible:ring-offset-background disabled:opacity-50",
                    rule.enabled ? "bg-primary" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform",
                      rule.enabled ? "translate-x-6" : "translate-x-0.5",
                    )}
                  />
                </button>
                <div className="flex shrink-0 flex-col">
                  {index > 0 ? (
                    <button
                      type="button"
                      aria-label={t.moveUp}
                      disabled={busy}
                      onClick={() => move(index, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      ▲
                    </button>
                  ) : null}
                  {index < sorted.length - 1 ? (
                    <button
                      type="button"
                      aria-label={t.moveDown}
                      disabled={busy}
                      onClick={() => move(index, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      ▼
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={t.deleteRule}
                  disabled={busy}
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Yeni kural formu. */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.ruleName}
            aria-label={t.ruleName}
            maxLength={128}
          />
          <Select
            value={matchType}
            onChange={(event) => setMatchType(event.target.value as RuleMatchType)}
            aria-label={t.ruleMatchType}
          >
            {MATCH_TYPES.map((type) => (
              <option key={type} value={type}>
                {matchTypeLabel(type, t)}
              </option>
            ))}
          </Select>
        </div>
        <Input
          value={matchValue}
          onChange={(event) => setMatchValue(event.target.value)}
          placeholder={matchValuePlaceholder(matchType, t)}
          aria-label={t.ruleMatchValue}
          maxLength={512}
        />
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            aria-label={t.ruleTarget}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </Select>
          <Select
            value={conflictPolicy}
            onChange={(event) =>
              setConflictPolicy(event.target.value as RuleCreateRequest["conflict_policy"])
            }
            aria-label={t.ruleConflictPolicy}
          >
            <option value="overwrite">{t.conflictOverwrite}</option>
            <option value="rename">{t.conflictRename}</option>
            <option value="version">{t.conflictVersion}</option>
            <option value="skip">{t.conflictSkip}</option>
          </Select>
        </div>
        <Input
          value={rename}
          onChange={(event) => setRename(event.target.value)}
          placeholder={t.ruleRename}
          aria-label={t.ruleRename}
          maxLength={255}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button
          onClick={addRule}
          disabled={busy || !name.trim() || !matchValue.trim() || targets.length === 0}
        >
          {t.addRule}
        </Button>
      </div>
    </Card>
  );
}
