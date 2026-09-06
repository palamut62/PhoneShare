"use client";

import type { DesktopSkin, MobileSkin } from "@/lib/storage/session";

import { DesktopCommandSkin, DesktopSecuritySkin, DesktopTraySkin } from "./desktop-skins";
import { MobileChunkHudSkin, MobileRadarSkin, MobileStagingSkin } from "./mobile-skins";
import type { DesktopSkinProps, MobileSkinProps } from "./types";

export type { DesktopSkinProps, MobileSkinProps };
export { DESKTOP_SKIN_LABELS, MOBILE_SKIN_LABELS } from "./types";

/** Klasik disindaki telefon stillerini secer. `classic` cagiran tarafta ele alinir. */
export function MobileSkin({ skin, ...props }: MobileSkinProps & { skin: MobileSkin }) {
  if (skin === "radar") return <MobileRadarSkin {...props} />;
  if (skin === "chunk-hud") return <MobileChunkHudSkin {...props} />;
  if (skin === "staging") return <MobileStagingSkin {...props} />;
  return null;
}

/** Klasik disindaki PC paneli stillerini secer. */
export function DesktopSkinView({ skin, ...props }: DesktopSkinProps & { skin: DesktopSkin }) {
  if (skin === "tray") return <DesktopTraySkin {...props} />;
  if (skin === "command") return <DesktopCommandSkin {...props} />;
  if (skin === "security") return <DesktopSecuritySkin {...props} />;
  return null;
}
