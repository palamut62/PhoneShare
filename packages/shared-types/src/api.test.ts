import { describe, expect, it } from "vitest";

import {
  API_ROUTES,
  errorResponseSchema,
  healthResponseSchema,
  pairConfirmRequestSchema,
  pairStartResponseSchema,
  receiverAddressSchema,
  sessionResponseSchema,
  ruleCreateRequestSchema,
  ruleResponseSchema,
  settingsResponseSchema,
  statsResponseSchema,
  transferStatusSchema,
  uploadCompleteResponseSchema,
  uploadInitRequestSchema,
  uploadInitResponseSchema,
} from "./api";

const SHA = "a".repeat(64);

describe("health", () => {
  it("PRD §45 yanitini kabul eder", () => {
    expect(
      healthResponseSchema.parse({ status: "online", version: "1.0.0" }),
    ).toMatchObject({ status: "online" });
  });

  it("is_local_client varsayilan olarak false, gelirse korunur", () => {
    expect(healthResponseSchema.parse({ status: "online", version: "1.0.0" }).is_local_client).toBe(
      false,
    );
    expect(
      healthResponseSchema.parse({ status: "online", version: "1.0.0", is_local_client: true })
        .is_local_client,
    ).toBe(true);
  });
});

describe("pairing", () => {
  it("kod formati 482-193 olmalidir", () => {
    expect(
      pairStartResponseSchema.safeParse({
        code: "482-193",
        expires_at: "2026-08-08T10:00:00Z",
        qr_payload: "{}",
      }).success,
    ).toBe(true);
    expect(
      pairStartResponseSchema.safeParse({
        code: "482193",
        expires_at: "2026-08-08T10:00:00Z",
        qr_payload: "{}",
      }).success,
    ).toBe(false);
  });

  it("adres listesi opsiyoneldir, yoksa bos dizi olur (PRD §47)", () => {
    const parsed = pairStartResponseSchema.parse({
      code: "482-193",
      expires_at: "2026-08-08T10:00:00Z",
      qr_payload: "{}",
    });
    expect(parsed.addresses).toEqual([]);
  });

  it("adres adaylarini dogrular", () => {
    const parsed = pairStartResponseSchema.parse({
      code: "482-193",
      expires_at: "2026-08-08T10:00:00Z",
      qr_payload: "{}",
      addresses: [
        {
          url: "http://192.168.1.180:8765/?pair=482-193",
          host: "192.168.1.180",
          kind: "lan",
          reachable_from_phone: true,
          label: "Yerel ag",
        },
      ],
    });
    expect(parsed.addresses[0]?.kind).toBe("lan");
    expect(
      receiverAddressSchema.safeParse({
        url: "http://x",
        host: "x",
        kind: "vpn",
        reachable_from_phone: true,
        label: "x",
      }).success,
    ).toBe(false);
  });

  it("cihaz adi zorunludur", () => {
    expect(
      pairConfirmRequestSchema.safeParse({ code: "482-193", device_name: "" }).success,
    ).toBe(false);
  });

  it("cookie oturum yanitini dogrular", () => {
    expect(
      sessionResponseSchema.parse({ device_id: "dev-1", device_name: "iPhone" }),
    ).toEqual({ device_id: "dev-1", device_name: "iPhone" });
  });
});

describe("upload init (PRD §58)", () => {
  it("PRD ornegini birebir kabul eder", () => {
    const parsed = uploadInitRequestSchema.parse({
      filename: "rapor.pdf",
      size: 15728640,
      mime_type: "application/pdf",
      target_id: "akpazar",
      sha256: SHA,
    });
    expect(parsed.filename).toBe("rapor.pdf");
  });

  it("gecersiz sha256'yi reddeder", () => {
    expect(
      uploadInitRequestSchema.safeParse({ filename: "a.pdf", size: 1, sha256: "zzz" }).success,
    ).toBe(false);
  });

  it("init yaniti existing_chunks icerir (PRD §28 resume)", () => {
    const parsed = uploadInitResponseSchema.parse({
      upload_id: "u1",
      chunk_size: 8388608,
      existing_chunks: [0, 1],
      transfer_id: "t1",
      total_chunks: 3,
    });
    expect(parsed.existing_chunks).toEqual([0, 1]);
  });
});

describe("durum makinesi (PRD §26)", () => {
  it("tum durumlari tanir", () => {
    for (const status of [
      "QUEUED",
      "PREPARING",
      "UPLOADING",
      "VERIFYING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ]) {
      expect(transferStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(transferStatusSchema.safeParse("pending").success).toBe(false);
  });

  it("complete yaniti dogrulama bayragi tasir (PRD §29)", () => {
    const parsed = uploadCompleteResponseSchema.parse({
      upload_id: "u1",
      transfer_id: "t1",
      status: "COMPLETED",
      verified: true,
      stored_filename: "rapor.pdf",
      size: 10,
    });
    expect(parsed.verified).toBe(true);
  });
});

describe("settings", () => {
  it("MVP disi bayraklar sozlesmede yer alir", () => {
    const parsed = settingsResponseSchema.parse({
      device_name: "UMUT-PC",
      chunk_size: 8388608,
      max_file_bytes: 10 * 1024 ** 3,
      max_total_transfer_bytes: 50 * 1024 ** 3,
      conflict_policy: "rename",
      naming_template: "",
      remember_last_target: true,
      telemetry_enabled: false,
      ai_enabled: false,
      notify_enabled: false,
      remote_launch_enabled: false,
      remote_browse_enabled: false,
    });
    expect(parsed.ai_enabled).toBe(false);
  });
});

describe("stats (PRD §42/§43)", () => {
  it("PRD ornegindeki tam yaniti kabul eder", () => {
    const parsed = statsResponseSchema.parse({
      today: { files: 3, bytes: 15728640, avg_speed: 842137.5 },
      week: { files: 10, bytes: 52428800, avg_speed: 500000.0 },
      month: { files: 42, bytes: 209715200, avg_speed: 600000.0 },
      total: { files: 137, bytes: 536870912, avg_speed: 555000.0 },
      daily: [{ date: "2026-08-08", files: 3, bytes: 15728640 }],
      top_targets: [{ target_id: "belgeler", name: "Belgeler", files: 2, bytes: 1024 }],
      file_types: [{ mime_type: "application/pdf", files: 2, bytes: 1024 }],
      by_device: [{ device_id: "a3f1", name: "iPhone Test", files: 3, bytes: 1024 }],
    });
    expect(parsed.total.files).toBe(137);
  });

  it("eksik alanli payload reddedilir", () => {
    const payload = {
      today: { files: 3, bytes: 15728640, avg_speed: 842137.5 },
      week: { files: 10, bytes: 52428800, avg_speed: 500000.0 },
      month: { files: 42, bytes: 209715200, avg_speed: 600000.0 },
      total: { files: 137, bytes: 536870912, avg_speed: 555000.0 },
      daily: [],
      top_targets: [],
      file_types: [],
      by_device: [],
    };
    delete (payload as Partial<typeof payload>).daily;
    expect(statsResponseSchema.safeParse(payload).success).toBe(false);
  });
});

describe("rules (PRD §33/§34)", () => {
  it("tam RuleResponse'u kabul eder", () => {
    const parsed = ruleResponseSchema.parse({
      id: "r1",
      name: "PDF'ler",
      priority: 2,
      enabled: true,
      match_type: "extension",
      match_value: "pdf",
      target_id: "belgeler",
      target_name: "Belgeler",
      rename: null,
      conflict_policy: "rename",
      created_at: "2026-08-08T10:00:00Z",
    });
    expect(parsed.target_name).toBe("Belgeler");
    expect(parsed.conflict_policy).toBe("rename");
  });

  it("hedef silinmis yanitta target_name null olabilir", () => {
    const result = ruleResponseSchema.safeParse({
      id: "r1",
      name: "PDF'ler",
      priority: 0,
      enabled: true,
      match_type: "extension",
      match_value: "pdf",
      target_id: "yok",
      target_name: null,
      rename: null,
      conflict_policy: "overwrite",
      created_at: "2026-08-08T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("gecersiz match_type reddedilir", () => {
    const result = ruleResponseSchema.safeParse({
      id: "r1",
      name: "PDF'ler",
      priority: 0,
      enabled: true,
      match_type: "gizli",
      match_value: "pdf",
      target_id: "belgeler",
      rename: null,
      conflict_policy: "rename",
      created_at: "2026-08-08T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("create istegi varsayilanlari uygular", () => {
    const parsed = ruleCreateRequestSchema.parse({
      name: "PDF'ler",
      match_type: "extension",
      match_value: "pdf",
      target_id: "belgeler",
    });
    expect(parsed.conflict_policy).toBe("rename");
    expect(parsed.enabled).toBe(true);
    expect(parsed.priority).toBeUndefined();
  });

  it("gecersiz conflict_policy reddedilir", () => {
    expect(
      ruleCreateRequestSchema.safeParse({
        name: "PDF'ler",
        match_type: "extension",
        match_value: "pdf",
        target_id: "belgeler",
        conflict_policy: "sil",
      }).success,
    ).toBe(false);
  });
});

describe("hata sozlesmesi (PRD §71)", () => {
  it("yalnizca code ve message tasir", () => {
    const parsed = errorResponseSchema.parse({
      code: "insufficient_storage",
      message: "Bilgisayarda yeterli disk alani bulunmuyor.",
    });
    expect(Object.keys(parsed).sort()).toEqual(["code", "message"]);
  });
});

describe("rotalar (PRD §57)", () => {
  it("PRD'deki yollarla birebir eslesir", () => {
    expect(API_ROUTES.health).toBe("/api/health");
    expect(API_ROUTES.pairConfirm).toBe("/api/pair/confirm");
    expect(API_ROUTES.uploadInit).toBe("/api/uploads/init");
    expect(API_ROUTES.uploadChunk("u1")).toBe("/api/uploads/u1/chunk");
    expect(API_ROUTES.uploadComplete("u1")).toBe("/api/uploads/u1/complete");
    expect(API_ROUTES.transfer("t1")).toBe("/api/transfers/t1");
    expect(API_ROUTES.stats).toBe("/api/stats");
    expect(API_ROUTES.rules).toBe("/api/rules");
    expect(API_ROUTES.rule("r1")).toBe("/api/rules/r1");
    expect(API_ROUTES.ws).toBe("/api/ws");
  });
});
