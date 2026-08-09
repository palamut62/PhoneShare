"use client";

import { Share, X } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { isTauri } from "@/lib/tauri";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

/**
 * PRD §11 — iOS Safari'de "Paylaş → Ana Ekrana Ekle" rehberi.
 * PRD §55 — WhatsApp'tan dogrudan paylasim yoktur; dogru akis burada anlatilir.
 */
export function InstallGuide() {
  const { preferences, savePreferences } = useApp();
  const [installed, setInstalled] = React.useState(true);

  React.useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  if (isTauri() || installed || preferences.installGuideDismissed) return null;

  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Rehberi kapat"
        className="absolute right-2 top-2"
        onClick={() => void savePreferences({ installGuideDismissed: true })}
      >
        <X aria-hidden className="h-4 w-4" />
      </Button>
      <CardTitle>Ana ekrana ekle</CardTitle>
      <p className="mt-2 flex items-center gap-2 text-sm text-foreground">
        <Share aria-hidden className="h-4 w-4 shrink-0 text-primary" />
        Safari&apos;de <strong>Paylaş</strong> → <strong>Ana Ekrana Ekle</strong> → <strong>Ekle</strong>
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Tam ekran açılır. İlk eşleştirmeden sonra oturum bu kısayolda saklanır.
      </p>
    </Card>
  );
}
