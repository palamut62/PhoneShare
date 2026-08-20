"use client";

import { AppWindow, Loader2, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { listInstalledApps, type InstalledApp } from "@/lib/tauri";

type DialogStatus = "loading" | "ready" | "error";

const MAX_RESULTS = 200;

interface AppPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (app: { name: string; path: string }) => void;
  onBrowse: () => void;
}

/** "Add app" — PC'de kurulu uygulamalari arayip secme dialogu. */
export function AppPickerDialog({ open, onClose, onSelect, onBrowse }: AppPickerDialogProps) {
  const [status, setStatus] = React.useState<DialogStatus>("loading");
  const [apps, setApps] = React.useState<InstalledApp[]>([]);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setStatus("loading");
    const result = await listInstalledApps();
    if (!result) {
      setApps([]);
      setStatus("error");
      return;
    }
    setApps(result);
    setStatus("ready");
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      void load();
    }
  }, [open, load]);

  // Esc ile kapatma: dialog acikken belge duzeyinde dinlenir.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return apps;
    return apps.filter((app) => app.name.toLowerCase().includes(needle));
  }, [apps, query]);

  const visible = filtered.slice(0, MAX_RESULTS);
  const remaining = filtered.length - visible.length;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add app"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <Card
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base text-foreground">Add app</CardTitle>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>

        {status === "loading" ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 aria-hidden className="h-7 w-7 animate-spin" />
            <p className="text-sm">Loading installed applications…</p>
          </div>
        ) : status === "error" ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3">
            <p className="text-center text-sm text-danger">
              Installed applications could not be listed. Use Browse to pick the file yourself.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search"
              autoFocus
            />

            {visible.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No matching applications.</p>
            ) : (
              <ul className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto">
                {visible.map((app) => (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect({ name: app.name, path: app.path });
                        onClose();
                      }}
                      className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <AppWindow aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{app.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {app.kind === "shortcut" ? "Shortcut" : "Application"}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {remaining > 0 ? (
              <p className="text-xs text-muted-foreground">{remaining} more — refine your search</p>
            ) : null}
          </div>
        )}

        <Button variant="secondary" className="mt-3" onClick={onBrowse}>
          Browse…
        </Button>
      </Card>
    </div>
  );
}
