"use client";

import type { FileBrowserEntry } from "@phoneshare/shared-types";
import { ChevronLeft, Download, File, Folder, HardDrive, LoaderCircle } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-providers";
import { AppShell } from "@/components/app-shell";
import { downloadFile, getFiles } from "@/lib/api/client";

function formatBytes(size: number | null, locale: string): string {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[index]}`;
}

export default function FilesPage() {
  return (
    <AppShell>
      <FilesScreen />
    </AppShell>
  );
}

function FilesScreen() {
  const { session, locale, preferences } = useApp();
  const isTurkish = preferences.language === "tr";
  const [targetId, setTargetId] = React.useState<string>();
  const [targetName, setTargetName] = React.useState("");
  const [path, setPath] = React.useState("");
  const [entries, setEntries] = React.useState<FileBrowserEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [downloading, setDownloading] = React.useState("");

  const load = React.useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const result = await getFiles(session.token, targetId, path);
      setEntries(result.entries);
      if (result.target_name) setTargetName(result.target_name);
    } catch {
      setError(isTurkish ? "Dosyalar alınamadı. Bilgisayar bağlantısını kontrol edin." : "Could not load files. Check the computer connection.");
    } finally {
      setLoading(false);
    }
  }, [isTurkish, path, session, targetId]);

  React.useEffect(() => { void load(); }, [load]);

  const openEntry = (entry: FileBrowserEntry) => {
    if (entry.kind === "target") {
      setTargetId(entry.target_id);
      setTargetName(entry.name);
      setPath("");
    } else if (entry.kind === "folder") {
      setPath(entry.path);
    }
  };

  const goBack = () => {
    if (!path) {
      setTargetId(undefined);
      setTargetName("");
      return;
    }
    setPath(path.split("/").slice(0, -1).join("/"));
  };

  const download = async (entry: FileBrowserEntry) => {
    if (!session || !targetId) return;
    setDownloading(entry.path);
    setError("");
    try {
      await downloadFile(session.token, targetId, entry.path);
    } catch {
      setError(isTurkish ? "Dosya indirilemedi." : "The file could not be downloaded.");
    } finally {
      setDownloading("");
    }
  };

  return (
    <main className="px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{isTurkish ? "PC Dosyaları" : "PC Files"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTurkish ? "Bilgisayarda paylaşıma açılan klasörlere göz atın ve dosyaları indirin." : "Browse shared computer folders and download files."}
        </p>
      </header>

      {targetId && (
        <button type="button" onClick={goBack} className="mb-3 flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronLeft className="h-5 w-5" aria-hidden />
          {path ? path.split("/").pop() : targetName}
        </button>
      )}

      {error && <div role="alert" className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      <section aria-busy={loading} className="overflow-hidden rounded-2xl border border-border bg-surface">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-label={isTurkish ? "Yükleniyor" : "Loading"} /></div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{isTurkish ? "Bu klasör boş." : "This folder is empty."}</div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => {
              const isContainer = entry.kind !== "file";
              const Icon = entry.kind === "target" ? HardDrive : entry.kind === "folder" ? Folder : File;
              return (
                <li key={`${entry.target_id}:${entry.path}:${entry.name}`} className="flex min-h-16 items-center gap-3 px-4">
                  <button type="button" disabled={!isContainer} onClick={() => openEntry(entry)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left disabled:cursor-default focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{entry.name}</span>
                      {entry.kind === "file" && <span className="text-xs text-muted-foreground">{formatBytes(entry.size, locale)}</span>}
                    </span>
                  </button>
                  {entry.kind === "file" && (
                    <button type="button" onClick={() => void download(entry)} disabled={downloading === entry.path} aria-label={`${entry.name} ${isTurkish ? "indir" : "download"}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                      {downloading === entry.path ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
