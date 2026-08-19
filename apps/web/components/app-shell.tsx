"use client";

import { BarChart3, History, Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { LocalPanelScreen } from "@/components/local-panel-screen";
import { PairDeviceDialog } from "@/components/pair-device-dialog";
import { PairingScreen } from "@/components/pairing-screen";
import { useHealth } from "@/hooks/use-receiver";
import { resolveShellView } from "@/lib/panel";
import { isTauri, takePairPrompt } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const PairDialogContext = React.createContext<() => void>(() => {});

/** Her ekrandan "Yeni Telefon Ekle" dialogunu acar (PRD §12). */
export function useOpenPairDialog(): () => void {
  return React.useContext(PairDialogContext);
}

// `next.config.mjs` -> `trailingSlash: true`. Href'ler bu bicimle birebir ayni
// olmazsa gezinme sunucu yonlendirmesine ve tam sayfa yeniden yuklemesine duser.
const NAV = [
  { href: "/", icon: Home, key: "home" as const },
  { href: "/transfers/", icon: History, key: "transfers" as const },
  { href: "/stats/", icon: BarChart3, key: "stats" as const },
  { href: "/settings/", icon: Settings, key: "settings" as const },
];

/** "/transfers" ve "/transfers/" ayni sekmedir. */
function normalizePath(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/** Nav + yerlesim sarmalayicisi; hem "app" hem "local-panel" dallari kullanir. */
function ShellChrome({ children }: { children: React.ReactNode }) {
  const { t } = useApp();
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col md:max-w-none md:pl-56">
      <div className="mx-auto w-full max-w-4xl flex-1 pb-24 md:pb-8">{children}</div>
      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 backdrop-blur-md md:inset-y-0 md:left-0 md:right-auto md:w-56 md:border-r md:border-t-0 md:bg-surface md:backdrop-blur-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Masaustu kenar cubugunda urun kimligi; mobilde alt barda yer yok. */}
        <div className="hidden items-center gap-2 px-4 pb-2 pt-6 md:flex">
          <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
          <span className="label-tech !tracking-[0.22em] text-foreground">PhoneShare</span>
        </div>
        <ul className="mx-auto flex w-full max-w-3xl md:flex-col md:gap-0.5 md:p-3">
          {NAV.map(({ href, icon: Icon, key }) => {
            const current = normalizePath(pathname);
            const target = normalizePath(href);
            const active = target === "/" ? current === "/" : current.startsWith(target);
            return (
              <li key={href} className="flex-1 md:flex-none">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-semibold tracking-tight transition-colors md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "text-foreground md:bg-muted"
                      : "text-muted-foreground hover:text-foreground md:hover:bg-muted/60",
                  )}
                >
                  {/* Etkin sekme isareti: mobilde ustte, masaustunde solda ince sinyal cizgisi. */}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary md:inset-x-auto md:inset-y-1.5 md:left-0 md:h-auto md:w-0.5"
                    />
                  ) : null}
                  <Icon aria-hidden className={cn("h-5 w-5", active && "text-primary")} />
                  {t[key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Eslesmemis cihaz once eslestirme ekranini gorur (PRD §12). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, session, enterDesktopSession } = useApp();
  const { isLocalClient, isChecking, deviceName } = useHealth();
  const pathname = usePathname();
  const [pairOpen, setPairOpen] = React.useState(false);
  const openPair = React.useCallback(() => setPairOpen(true), []);

  // Masaustu kabugu istedi mi? (ilk kurulum sonu — PRD §10 adim 6 — veya tepsi menusu)
  React.useEffect(() => {
    if (!isTauri()) return;
    const check = () => {
      void takePairPrompt().then((wanted) => {
        if (wanted) setPairOpen(true);
      });
    };
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  // Oturum yokken health cevabi beklenir: aksi halde PC panelinde bir an telefon
  // (kod girme) ekrani parlar.
  const view = resolveShellView({
    ready: ready && !(!session && isChecking),
    hasSession: Boolean(session),
    isTauriShell: isTauri(),
    isLocalClient,
  });

  if (view === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        <span className="sr-only">Loading</span>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // PC'nin kendi paneli: telefon degil, kod URETIR (PRD §12). Kabuk render edilir ki
  // eslesme oncesinde de Transfers/Stats/Settings sekmelerine gecilebilsin (loopback erisimi).
  if (view === "local-panel") {
    const atRoot = normalizePath(pathname) === "/";
    return (
      <PairDialogContext.Provider value={openPair}>
        <ShellChrome>
          {atRoot ? (
            <LocalPanelScreen
              embedded
              onAddDevice={openPair}
              onSelectDevice={enterDesktopSession}
              deviceName={deviceName}
            />
          ) : (
            children
          )}
        </ShellChrome>
        <PairDeviceDialog open={pairOpen} onClose={() => setPairOpen(false)} />
      </PairDialogContext.Provider>
    );
  }

  if (view === "pairing") {
    return (
      <PairDialogContext.Provider value={openPair}>
        <PairingScreen />
        <PairDeviceDialog open={pairOpen} onClose={() => setPairOpen(false)} />
      </PairDialogContext.Provider>
    );
  }

  return (
    <PairDialogContext.Provider value={openPair}>
      <ShellChrome>{children}</ShellChrome>
      <PairDeviceDialog open={pairOpen} onClose={() => setPairOpen(false)} />
    </PairDialogContext.Provider>
  );
}
