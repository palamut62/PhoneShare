export type MatchType =
  | "extension"
  | "filename"
  | "source"
  | "size"
  | "date"
  | "tag";

export type ConflictPolicy = "overwrite" | "rename" | "version" | "skip";

/** PRD §26 — transfer kuyrugu durum makinesi. */
export type TransferStatus =
  | "QUEUED"
  | "PREPARING"
  | "UPLOADING"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Folder {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  /** Hicbir kural eslesmezse kullanilacak klasor. */
  isDefault?: boolean;
}

export interface Rule {
  id: string;
  name: string;
  /** Kucuk sayi = yuksek oncelik. Esitlikte `id` ile deterministik siralanir. */
  priority: number;
  enabled: boolean;
  matchType: MatchType;
  matchValue: string;
  targetFolderId: string;
  rename: string | null;
  conflictPolicy: ConflictPolicy;
}

export interface FileMeta {
  fileName: string;
  sizeBytes: number;
  sourceApp?: string | null;
  mimeType?: string | null;
  /** Dosyanin olusturulma/alinma zamani. */
  createdAt?: Date | string | null;
  tags?: string[];
}

export interface ResolvedTarget {
  folderId: string | null;
  fileName: string;
  conflictPolicy: ConflictPolicy;
  /** Eslesen kuralin id'si; varsayilana dusuldiyse null. */
  matchedRuleId: string | null;
}
