"use client";

import { qrPayloadSchema } from "@phoneshare/shared-types";
import { Camera, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { InstallGuide } from "@/components/install-guide";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/field";
import { confirmPairing } from "@/lib/api/client";
import { toUserFacingError } from "@/lib/upload/errors";
import type { UserFacingError } from "@/lib/upload/types";
import { formatPairingCode, isCompletePairingCode } from "@/lib/utils";

/** Tarayici destegi opsiyoneldir; yoksa yalnizca kod girisi gosterilir. */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

function getBarcodeDetector(): (new (options: { formats: string[] }) => BarcodeDetectorLike) | null {
  const ctor = (window as unknown as Record<string, unknown>).BarcodeDetector;
  return typeof ctor === "function"
    ? (ctor as new (options: { formats: string[] }) => BarcodeDetectorLike)
    : null;
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android Phone";
  return "Phone";
}

/** Telefon tarafi: bilgisayarda uretilen kodu girer (PRD §12). PC paneli bu ekrani gormez. */
export function PairingScreen() {
  const { saveSession } = useApp();
  const [code, setCode] = React.useState("");
  const [deviceName, setDeviceName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<UserFacingError | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanSupported, setScanSupported] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    setDeviceName(defaultDeviceName());
    setScanSupported(Boolean(getBarcodeDetector()) && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const stopScan = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  React.useEffect(() => stopScan, [stopScan]);

  const submit = React.useCallback(
    async (rawCode: string) => {
      if (!isCompletePairingCode(rawCode)) return;
      setBusy(true);
      setError(null);
      try {
        const response = await confirmPairing(rawCode, deviceName.trim() || defaultDeviceName());
        await saveSession({
          deviceId: response.device_id,
          deviceName: response.device_name,
          token: response.token,
          pairedAt: Date.now(),
        });
      } catch (caught) {
        const shown = toUserFacingError(caught);
        setError(
          shown.code === "forbidden"
            ? {
                ...shown,
                title: "Invalid code",
                message:
                  "The pairing code is incorrect or expired. Generate a new code on the computer and try again.",
                actionLabel: "Try Again",
              }
            : shown,
        );
      } finally {
        setBusy(false);
      }
    },
    [deviceName, saveSession],
  );

  // QR okutunca `/?pair=482-193` ile açılır: kodu otomatik doldurup gönderir.
  const autoFilledRef = React.useRef(false);
  React.useEffect(() => {
    if (autoFilledRef.current) return;
    autoFilledRef.current = true;
    const raw = new URLSearchParams(window.location.search).get("pair");
    if (!raw) return;
    const formatted = formatPairingCode(raw);
    if (isCompletePairingCode(formatted)) {
      setCode(formatted);
      void submit(formatted);
    }
  }, [submit]);

  const startScan = React.useCallback(async () => {
    const Detector = getBarcodeDetector();
    if (!Detector) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const found = await detector.detect(video);
          const raw = found[0]?.rawValue;
          if (raw) {
            try {
              const u = new URL(raw);
              const pair = u.searchParams.get("pair");
              if (pair) {
                const formatted = formatPairingCode(pair);
                if (isCompletePairingCode(formatted)) {
                  stopScan();
                  setCode(formatted);
                  void submit(formatted);
                  return;
                }
              }
            } catch {
              // URL degil; JSON akisina dus.
            }
            const parsed = qrPayloadSchema.safeParse(JSON.parse(raw));
            const scanned = parsed.success ? parsed.data.code : "";
            const formatted = formatPairingCode(scanned);
            if (isCompletePairingCode(formatted)) {
              stopScan();
              setCode(formatted);
              void submit(formatted);
              return;
            }
          }
        } catch {
          // Kare cozulemedi; taramaya devam.
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      stopScan();
      setError({
        code: "unknown",
        title: "Camera unavailable",
        message: "Camera permission was not granted. You can enter the pairing code manually.",
        actionLabel: "OK",
        action: "dismiss",
        retryable: false,
      });
    }
  }, [stopScan, submit]);

  return (
    <main className="stagger-in mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 py-6">
      <header className="flex flex-col items-center gap-2 pt-5 text-center">
        <span className="rounded-lg bg-primary p-3 text-primary-foreground">
          <ShieldCheck aria-hidden className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Add your computer</h1>
        <p className="text-sm text-muted-foreground">
          Enter the six-digit code shown in PhoneShare on your computer, or scan the QR code.
        </p>
      </header>

      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit(code);
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <Label htmlFor="pairing-code" className="label-tech">
              Pairing code
            </Label>
            <Input
              id="pairing-code"
              value={code}
              onChange={(event) => setCode(formatPairingCode(event.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="482-193"
              aria-describedby="pairing-code-hint"
              className="num h-auto border-none bg-transparent text-center text-5xl tracking-[0.3em] focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            <p id="pairing-code-hint" className="text-xs text-muted-foreground">
              The code is valid for 5 minutes.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="device-name">Device name</Label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value.slice(0, 64))}
              placeholder="iPhone 15"
            />
          </div>

          <Button type="submit" size="lg" disabled={!isCompletePairingCode(code) || busy}>
            {busy ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <KeyRound aria-hidden className="h-4 w-4" />}
            {busy ? "Connecting…" : "Connect"}
          </Button>

          {scanSupported ? (
            <Button type="button" variant="secondary" size="lg" onClick={() => void startScan()}>
              <Camera aria-hidden className="h-4 w-4" />
              Scan QR Code
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              This browser does not support QR scanning. Enter the code manually.
            </p>
          )}
        </form>

        {scanning ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <video ref={videoRef} playsInline muted className="h-56 w-full bg-black object-cover" />
            <Button variant="ghost" className="w-full" onClick={stopScan}>
              Stop Scanning
            </Button>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="hidden" />
        )}

        {error ? (
          <div role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 p-3">
            <p className="text-sm font-semibold text-danger">{error.title}</p>
            <p className="mt-1 text-sm text-foreground">{error.message}</p>
            <Button variant="secondary" className="mt-3" onClick={() => setError(null)}>
              {error.actionLabel}
            </Button>
          </div>
        ) : null}
      </Card>

      <p className="px-2 text-center text-xs leading-5 text-muted-foreground">
        Files go directly to your computer. Nothing is uploaded to the cloud.
      </p>

      <InstallGuide />
    </main>
  );
}
