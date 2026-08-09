"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import { getCurrentSession } from "@/lib/api/client";

import { dictionaryFor, type Dictionary } from "@/lib/i18n";
import { isTauri } from "@/lib/tauri";
import {
  COOKIE_SESSION_TOKEN,
  DESKTOP_SESSION_TOKEN,
  DEFAULT_PREFERENCES,
  clearSession,
  getPreferences,
  getSession,
  setPreferences as persistPreferences,
  setSession as persistSession,
  type DeviceSession,
  type Preferences,
} from "@/lib/storage/session";

interface AppState {
  ready: boolean;
  session: DeviceSession | null;
  preferences: Preferences;
  t: Dictionary;
  locale: string;
  savePreferences: (patch: Partial<Preferences>) => Promise<void>;
  saveSession: (session: DeviceSession) => Promise<void>;
  enterDesktopSession: (deviceId: string, deviceName: string) => void;
  resetSession: () => Promise<void>;
}

const AppContext = React.createContext<AppState | null>(null);

export function useApp(): AppState {
  const context = React.useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProviders");
  return context;
}

function applyTheme(theme: Preferences["theme"]): void {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  try {
    localStorage.setItem("phoneshare.theme", theme);
  } catch {
    // Depolama engelliyse tema yalnizca bu oturumda gecerlidir.
  }
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: !isTauri(),
            staleTime: isTauri() ? 30_000 : 5_000,
          },
        },
      }),
  );

  const [ready, setReady] = React.useState(false);
  const [session, setSessionState] = React.useState<DeviceSession | null>(null);
  const [preferences, setPreferencesState] = React.useState<Preferences>(DEFAULT_PREFERENCES);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      const [storedSession, storedPreferences] = await Promise.all([getSession(), getPreferences()]);
      if (!active) return;
      let restoredSession = storedSession;
      if (!restoredSession) {
        try {
          const cookieSession = await getCurrentSession();
          restoredSession = {
            deviceId: cookieSession.device_id,
            deviceName: cookieSession.device_name,
            token: COOKIE_SESSION_TOKEN,
            pairedAt: Date.now(),
          };
          await persistSession(restoredSession);
        } catch {
          // Cookie yoksa normal eslestirme ekrani gosterilir.
        }
      }
      if (!active) return;
      setSessionState(restoredSession);
      setPreferencesState(storedPreferences);
      applyTheme(storedPreferences.theme);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Sistem temasi degisirse (PRD §68) aninda uygulanir.
  React.useEffect(() => {
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferences.theme]);

  const savePreferences = React.useCallback(
    async (patch: Partial<Preferences>) => {
      const next = { ...preferences, ...patch };
      setPreferencesState(next);
      if (patch.theme) applyTheme(patch.theme);
      await persistPreferences(next);
    },
    [preferences],
  );

  const saveSession = React.useCallback(async (next: DeviceSession) => {
    setSessionState(next);
    await persistSession(next);
  }, []);

  const enterDesktopSession = React.useCallback((deviceId: string, deviceName: string) => {
    setSessionState({
      deviceId,
      deviceName,
      token: DESKTOP_SESSION_TOKEN,
      pairedAt: Date.now(),
    });
  }, []);

  const resetSession = React.useCallback(async () => {
    setSessionState(null);
    await clearSession();
  }, []);

  const value = React.useMemo<AppState>(
    () => ({
      ready,
      session,
      preferences,
      t: dictionaryFor(preferences.language),
      locale: preferences.language === "tr" ? "tr-TR" : "en-US",
      savePreferences,
      saveSession,
      enterDesktopSession,
      resetSession,
    }),
    [ready, session, preferences, savePreferences, saveSession, enterDesktopSession, resetSession],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}
