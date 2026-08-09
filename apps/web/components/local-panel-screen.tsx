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
          Telefonunuzu bağlamak için QR kodu okutun.
        </p>
      </header>

      {/* PRD §70 — birincil eylem en ustte, 44px+ dokunma hedefi. */}
      <Button size="xl" onClick={onAddDevice}>
        <QrCode aria-hidden className="h-5 w-5" />
        {t.addDevice}
      </Button>

      {registeredDevices.length > 0 ? (
        <Card>
          <CardTitle>Kayıtlı telefonlar</CardTitle>
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
                    {device.enabled ? "Bağlı - yönetmek için aç" : "Devre dışı"}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>NASIL ÇALIŞIR?</CardTitle>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            &quot;{t.addDevice}&quot; ile QR kodu ve 6 haneli eşleştirme kodunu oluşturun.
          </li>
          <li>Telefonunuzun kamerasıyla QR kodu okutun ya da kodu telefona elle girin.</li>
          <li>Dosyalarınız doğrudan bu bilgisayara gelir; buluta yüklenmez.</li>
        </ol>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-success/10 p-2 text-success">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <p className="text-sm text-muted-foreground">
            {deviceName
              ? `${deviceName} hazır. Eşleştirme kodu yalnızca bu bilgisayarda oluşturulabilir ve 5 dakika geçerlidir.`
              : "Eşleştirme kodu yalnızca bu bilgisayarda oluşturulabilir ve 5 dakika geçerlidir."}
          </p>
        </div>
      </Card>
    </main>
  );
}
