"use client";

import { HEALTH_POLL_INTERVAL_MS } from "@phoneshare/shared-config";
import type { WsEvent } from "@phoneshare/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  buildWebSocketUrl,
  getDevices,
  getHealth,
  getRules,
  getSettings,
  getStats,
  getTargets,
  getTransfers,
} from "@/lib/api/client";
import { useApp } from "@/components/app-providers";
import { isTauri } from "@/lib/tauri";

/** PRD §44/§45 — PC durumu. WS varsa canli, yoksa polling. */
export function useHealth() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    retry: 0,
  });

  return {
    isOnline: query.isSuccess && query.data?.status === "online",
    isChecking: query.isLoading,
    deviceName: query.data?.device_name ?? null,
    version: query.data?.version ?? null,
    /** PRD §12 — istek loopback'ten geldiyse burasi PC'nin kendi panelidir. */
    isLocalClient: query.data?.is_local_client === true,
    refetch: query.refetch,
  };
}

export function useTargets() {
  const { session } = useApp();
  return useQuery({
    queryKey: ["targets"],
    queryFn: () => getTargets(session?.token ?? ""),
    enabled: Boolean(session?.token) || isTauri(),
  });
}

/**
 * PRD §62 — eslesmis cihazlar; ana ekranda "telefon ekle" cagrisi icin.
 * PC panelinde oturum tokeni yoktur: 401 beklenen bir durumdur, sessizce bos kabul
 * edilir ve tekrar denenmez (gurultulu hata / sonsuz retry olmaz).
 */
export function useDevices() {
  const { session } = useApp();
  return useQuery({
    queryKey: ["devices"],
    queryFn: () => getDevices(session?.token ?? ""),
    enabled: Boolean(session?.token) || isTauri(),
    retry: 0,
  });
}

export function useTransfers(params: { q?: string; limit?: number } = {}) {
  const { session } = useApp();
  return useQuery({
    queryKey: ["transfers", params.q ?? "", params.limit ?? 50],
    queryFn: () => getTransfers(session?.token ?? "", params),
    enabled: Boolean(session?.token),
  });
}

/** PRD §42/§43 — istatistikler; yeni transfer gelince (WS) invalidate edilir. */
export function useStats() {
  const { session } = useApp();
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => getStats(session?.token ?? ""),
    enabled: Boolean(session?.token),
  });
}

export function useReceiverSettings() {
  const { session } = useApp();
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(session?.token ?? ""),
    enabled: Boolean(session?.token),
  });
}

/** PRD §33/§34 — klasor kurallari; priority kucuk olan once denenir. */
export function useRules() {
  const { session } = useApp();
  return useQuery({
    queryKey: ["rules"],
    queryFn: () => getRules(session?.token ?? ""),
    enabled: Boolean(session?.token),
  });
}

/**
 * PRD §46 — WebSocket olaylarini dinler. `4401` ile kapanirsa oturum silinir ve
 * kullanici yeniden eslestirme akisina duser.
 */
export function useReceiverEvents(onEvent?: (event: WsEvent) => void) {
  const { session, resetSession } = useApp();
  const queryClient = useQueryClient();
  const [connected, setConnected] = React.useState(false);
  const handlerRef = React.useRef(onEvent);
  handlerRef.current = onEvent;

  React.useEffect(() => {
    if (!session?.token) return;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      try {
        socket = new WebSocket(buildWebSocketUrl(session.token));
      } catch {
        return;
      }
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(String(message.data)) as WsEvent;
          handlerRef.current?.(parsed);
          if (parsed.event.startsWith("transfer.")) {
            void queryClient.invalidateQueries({ queryKey: ["transfers"] });
          }
          if (parsed.event.startsWith("device.")) {
            void queryClient.invalidateQueries({ queryKey: ["devices"] });
          }
        } catch {
          // Bicimsiz mesajlar yoksayilir.
        }
      };
      socket.onclose = (event) => {
        setConnected(false);
        if (event.code === 4401) {
          void resetSession();
          return;
        }
        if (closed) return;
        attempt += 1;
        // Baglanti yoksa polling devrede kalir; WS arka planda yeniden denenir.
        retryTimer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt));
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [session?.token, queryClient, resetSession]);

  return { connected };
}
