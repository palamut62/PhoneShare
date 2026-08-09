"use client";

import { ChevronRight, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { useDevices } from "@/hooks/use-receiver";

interface LocalPanelScreenProps {
  /** "Yeni Telefon Ekle" dialogunu (QR + 6 haneli kod) acar. */
  onAddDevice: () => void;
  onSelectDevice: (deviceId: string, deviceName: string) => void;
  deviceName?: string | null;
}

/**
 * PC'nin kendi paneli, henuz telefon eslesmemis (PRD §12).
 * Buradaki kullanici bir telefon DEGILDIR: kod girmez, kod URETIR.
 */
export function LocalPanelScreen({ onAddDevice, onSelectDevice, deviceName }: LocalPanelScreenProps) {
  const { t } = useApp();
  const devices = useDevices();
  const registeredDevices = devices.data ?? [];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6 md:max-w-3xl md:px-8">
      <header className="flex flex-col items-center gap-2 pt-6 text-center">
        <span className="rounded-[18px] bg-primary p-3 text-white">
          <Smartphone aria-hidden className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-semibold">{t.noDeviceTitle}</h1>
        <p className="text-sm text-muted-foreground">
          Scan the QR code to connect your phone.
        </p>
      </header>

      {/* PRD §70 — birincil eylem en ustte, 44px+ dokunma hedefi. */}
      <Button size="xl" onClick={onAddDevice}>
        <QrCode aria-hidden className="h-5 w-5" />
        {t.addDevice}
      </Button>

      {registeredDevices.length > 0 ? (
        <Card>
          <CardTitle>Registered phones</CardTitle>
          <div className="mt-3 flex flex-col gap-2">
            {registeredDevices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => onSelectDevice(device.id, device.name)}
                className="flex min-h-14 items-center gap-3 rounded-xl bg-muted px-3 text-left hover:bg-border focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Smartphone aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{device.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {device.enabled ? "Connected - open to manage" : "Disabled"}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>HOW IT WORKS</CardTitle>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Select &quot;{t.addDevice}&quot; to generate a QR code and a six-digit pairing code.
          </li>
          <li>Scan the QR code with your phone camera or enter the code manually.</li>
          <li>Files go directly to this computer and are never uploaded to the cloud.</li>
        </ol>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-success/10 p-2 text-success">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            {deviceName
              ? `${deviceName} is ready. Pairing codes can only be generated on this computer and expire in 5 minutes.`
              : "Pairing codes can only be generated on this computer and expire in 5 minutes."}
          </p>
        </div>
      </Card>
    </main>
  );
}
