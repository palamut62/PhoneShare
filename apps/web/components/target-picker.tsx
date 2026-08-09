"use client";

import type { TargetResponse } from "@phoneshare/shared-types";
import { Star } from "lucide-react";

import { Label, Select } from "@/components/ui/field";

/**
 * Hedef secici (PRD §20-§22).
 * Yalnizca `target_id` kullanilir; gercek Windows yolu istemciye hic gelmez (PRD §93).
 */
export function TargetPicker({
  targets,
  value,
  onChange,
  label,
  id = "target-picker",
}: {
  targets: TargetResponse[];
  value: string | null;
  onChange: (targetId: string | null) => void;
  label: string;
  id?: string;
}) {
  const enabled = targets.filter((target) => target.enabled);
  // PRD §21 — favoriler once.
  const sorted = [...enabled].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, "tr");
  });
  const favorites = sorted.filter((target) => target.favorite).slice(0, 3);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Otomatik (kurallara göre)</option>
        {sorted.map((target) => (
          <option key={target.id} value={target.id}>
            {target.favorite ? "★ " : ""}
            {target.name}
          </option>
        ))}
      </Select>

      {favorites.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {favorites.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => onChange(target.id)}
              aria-pressed={value === target.id}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  value === target.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-foreground"
                }`}
            >
              <Star aria-hidden className="h-3.5 w-3.5" />
              {target.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
