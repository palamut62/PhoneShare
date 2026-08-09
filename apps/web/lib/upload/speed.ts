/**
 * Anlik hiz ve kalan sure hesabi (PRD §24).
 * Kayan pencere kullanilir; tek bir yavas parca ETA'yi bozmasin diye.
 */

export interface SpeedSample {
  at: number;
  bytes: number;
}

export class SpeedMeter {
  private samples: SpeedSample[] = [];

  constructor(private readonly windowMs = 5_000) {}

  /** `bytes` o ana kadar gonderilmis **toplam** bayt degildir; artistir. */
  record(bytes: number, at: number): void {
    if (bytes <= 0) return;
    this.samples.push({ at, bytes });
    this.trim(at);
  }

  /** Bayt/saniye. Yeterli olcum yoksa `null`. */
  bytesPerSecond(now: number): number | null {
    this.trim(now);
    if (this.samples.length === 0) return null;
    const first = this.samples[0];
    if (!first) return null;
    const elapsedMs = Math.max(now - first.at, 1);
    const total = this.samples.reduce((sum, sample) => sum + sample.bytes, 0);
    if (total <= 0) return null;
    return (total * 1000) / elapsedMs;
  }

  /** Kalan saniye. Hiz bilinmiyorsa `null`. */
  etaSeconds(remainingBytes: number, now: number): number | null {
    if (remainingBytes <= 0) return 0;
    const speed = this.bytesPerSecond(now);
    if (speed === null || speed <= 0) return null;
    return remainingBytes / speed;
  }

  reset(): void {
    this.samples = [];
  }

  private trim(now: number): void {
    const cutoff = now - this.windowMs;
    while (this.samples.length > 1 && (this.samples[0]?.at ?? 0) < cutoff) {
      this.samples.shift();
    }
  }
}

export function formatBytes(bytes: number, locale = "tr-TR"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 1;
  return `${value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[unit]}`;
}

export function formatSpeed(bytesPerSecond: number | null, locale = "tr-TR"): string {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond)) return "—";
  return `${formatBytes(bytesPerSecond, locale)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} sn`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} dk ${total % 60} sn`;
  const hours = Math.floor(minutes / 60);
  return `${hours} sa ${minutes % 60} dk`;
}
