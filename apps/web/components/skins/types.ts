import type { TargetResponse, TransferResponse } from "@phoneshare/shared-types";

import type { DesktopSkin, MobileSkin } from "@/lib/storage/session";
import type { QueueItem } from "@/lib/upload/types";

/** Telefon gorunum stillerinin ortak veri sozlesmesi. Hepsi GERCEK veriyle beslenir. */
export interface MobileSkinProps {
  isOnline: boolean;
  deviceName: string | null;
  targets: TargetResponse[];
  targetId: string | null;
  onTargetChange: (value: string | null) => void;
  items: QueueItem[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    uploadedBytes: number;
    totalBytes: number;
    percent: number;
  };
  onPickFiles: () => void;
  onPickPhotos: () => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onClear: () => void;
  locale: string;
}

/** PC paneli gorunum stillerinin ortak veri sozlesmesi. */
export interface DesktopSkinProps {
  deviceName: string | null;
  isOnline: boolean;
  version: string | null;
  /** Telefonun ulasabilecegi yayin adresleri (health'ten). */
  addresses: { url: string; label: string; kind: string; reachable_from_phone: boolean }[];
  devices: { id: string; name: string; enabled: boolean }[];
  transfers: TransferResponse[];
  onAddDevice: () => void;
  onSelectDevice: (deviceId: string, deviceName: string) => void;
  locale: string;
}

export const MOBILE_SKIN_LABELS: Record<MobileSkin, string> = {
  classic: "Classic",
  radar: "Radar quick share",
  "chunk-hud": "Chunk HUD",
  staging: "Batch staging",
};

export const DESKTOP_SKIN_LABELS: Record<DesktopSkin, string> = {
  classic: "Classic",
  tray: "Compact tray",
  command: "Pro command center",
  security: "Security tower",
};
