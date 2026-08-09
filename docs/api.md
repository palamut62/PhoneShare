# PhoneShare Receiver — API

- Taban adres: `http://<pc-ip>:8765` (varsayilan port `8765`)
- Tum uc noktalar `/api` onekiyle baslar. Eski `/v1/...` yollari **yoktur**.
- Tum JSON alan adlari **snake_case**'dir.
- Kimlik dogrulama: `Authorization: Bearer <token>` (yalnizca `/api/health`, `/api/pair`
  ve `/api/pair/confirm` haric).
- Bilinmeyen alan gonderilirse `422` doner (`extra="forbid"`).
- OpenAPI: `GET /openapi.json`, Swagger UI: `/docs`

## Hata sozlesmesi

Tum hatalar **sadece** su iki alani doner; teknik detay (dosya yolu, stack, disk bilgisi)
**asla** istemciye sizmaz (PRD §71), yalnizca sunucu loguna yazilir.

```json
{ "code": "insufficient_storage", "message": "Bilgisayarda yeterli disk alani bulunmuyor." }
```

| Kod | HTTP | Anlam |
|---|---|---|
| `unauthorized` | 401 | Token yok / gecersiz / cihaz devre disi |
| `forbidden` | 403 | Gecersiz veya tukenmis eslestirme kodu, izinsiz yol |
| `not_found` | 404 | Kayit yok |
| `conflict` | 409 | Eksik parca, iptal edilmis yukleme |
| `too_large` | 413 | Dosya/govde/toplam transfer limiti asildi |
| `validation_error` | 422 | Gecersiz istek |
| `checksum_mismatch` | 422 | SHA-256 dogrulamasi basarisiz (transfer FAILED) |
| `rate_limited` | 429 | Hiz limiti (`Retry-After` basligi) |
| `insufficient_storage` | 507 | Diskte yeterli alan yok |

---

## GET /api/health

Kimlik gerektirmez.

```json
{
  "status": "online",
  "version": "1.0.0",
  "device_name": "UMUT-PC",
  "owner": "Umut Celik (palamut62)"
}
```

## POST /api/pair

Bilgisayardan (tray/yerel arayuz) cagrilir. Govde yok. Kod 5 dakika gecerlidir.

```json
{
  "code": "482-193",
  "expires_at": "2026-08-08T12:05:00Z",
  "qr_payload": "{\"v\":1,\"url\":\"http://192.168.1.20:8765\",\"code\":\"482-193\",\"name\":\"UMUT-PC\"}"
}
```

## POST /api/pair/confirm

Telefondan cagrilir. Kod tek kullanimliktir; tiresiz de kabul edilir (`482193`).
5 hatali denemeden sonra ilgili eslestirme oturumu yakilir; IP basina hiz limiti uygulanir.

İstek:
```json
{ "code": "482-193", "device_name": "iPhone 15" }
```
Yanit:
```json
{ "device_id": "a3f1...", "token": "uzun-rastgele-token", "device_name": "iPhone 15" }
```
> `token` **yalnizca burada** doner ve sunucuda sadece SHA-256 hash'i saklanir. Istemci
> guvenli depolamada (iOS Keychain / secure storage) tutmalidir.

## GET /api/devices

```json
[{ "id": "a3f1...", "name": "iPhone 15", "created_at": "...", "last_seen": "...", "enabled": true }]
```

## DELETE /api/devices/{device_id}

`204 No Content`. Cihazin tokeni aninda gecersizlesir.

## GET /api/targets

```json
[{
  "id": "belgeler", "name": "Belgeler", "icon": "folder", "favorite": true,
  "enabled": true, "created_at": "...", "updated_at": "..."
}]
```
> Yanitta gercek Windows yolu **yer almaz** (PRD §93). Hedefler sanaldir; istemci yalnizca
> `id` ve `name` gorur.

## POST /api/targets → `201`

```json
{ "name": "Belgeler", "path": "D:\\Depo\\Belgeler", "icon": "folder", "favorite": true, "enabled": true }
```
`path` mutlak olmalidir ve izinli kokler altinda kalmalidir; `..`, UNC (`\\sunucu\...`),
surucu degisimi ve symlink kacisi reddedilir (`403`).

## PUT /api/targets/{target_id}

Kismi guncelleme: `name`, `path`, `icon`, `favorite`, `enabled`. Yanit `TargetResponse`.

## DELETE /api/targets/{target_id}

`204`. Diskteki klasor **silinmez**, yalnizca kayit kaldirilir.

## GET /api/rules

Klasor kurallari (PRD §33/§34). Siralama `priority` ASC, esitlikte `id` ASC;
kucuk oncelikli kural once denenir (PRD §34).

```json
[{
  "id": "a3f1b2...", "name": "PDF'ler", "priority": 1, "enabled": true,
  "match_type": "extension", "match_value": "pdf", "target_id": "belgeler",
  "target_name": "Belgeler", "rename": null, "conflict_policy": "rename",
  "created_at": "..."
}]
```
- `match_type` degerleri: `extension`, `filename`, `source`, `size`, `date`, `tag`.
- `target_name` LEFT JOIN'den gelir; hedef silinmisse `null` (kural yine de listelenir).
- `conflict_policy` degerleri: `rename` (varsayilan), `overwrite`, `skip`, `version`.

## POST /api/rules → `201`

İstek:
```json
{
  "name": "PDF'ler", "match_type": "extension", "match_value": "pdf",
  "target_id": "belgeler", "conflict_policy": "rename", "priority": 3, "enabled": true
}
```
- `priority` verilmezse mevcut kurallardan `max(priority) + 1` atanir.
- `target_id` mevcut **ve etkin** bir hedef olmalidir; aksi halde `422 validation_error`
  (`"Hedef bulunamadi."`).
- `rename` sablon degiskenleri: `{date} {source} {orig} {ext} {seq}`; bos string `null`
  olarak saklanir.

## PUT /api/rules/{rule_id}

Kismi guncelleme: `name`, `match_type`, `match_value`, `target_id`, `rename`,
`conflict_policy`, `priority`, `enabled`. Yanit `RuleResponse`.
`target_id` degistirilirken ayni hedef dogrulamasi (`422`) uygulanir; olmayan kural `404`.

## DELETE /api/rules/{rule_id}

`204`. Kural kalici olarak kaldirilir; olmayan kural `404`.

## POST /api/uploads/init

İstek (PRD §58):
```json
{
  "filename": "rapor.pdf",
  "size": 2451234,
  "mime_type": "application/pdf",
  "target_id": "belgeler",
  "sha256": "a1b2c3..."
}
```
- `target_id` `null` ise kural motoru + varsayilan hedef karar verir.
- `sha256` (64 haneli hex) verilmesi onerilir; `complete` asamasinda dogrulanir.

Yanit:
```json
{
  "upload_id": "u_9f3a...",
  "chunk_size": 8388608,
  "existing_chunks": [],
  "transfer_id": "t_71bc...",
  "total_chunks": 1
}
```
**Resume:** ayni `(device, filename, size, sha256)` icin devam eden bir yukleme varsa
**ayni** `upload_id` ve diskte mevcut olan parca indeksleri `existing_chunks` icinde doner;
istemci yalnizca eksik parcalari gonderir.

Hatalar: `413 too_large` (tek dosya / toplam transfer limiti), `507 insufficient_storage`.

## POST /api/uploads/{upload_id}/chunk

İki gonderim bicimi desteklenir:

1. Ham govde (onerilen):
   `POST /api/uploads/{id}/chunk?chunk_index=0&chunk_hash=<sha256hex>`
   `Content-Type: application/octet-stream`, govde = parcanin ham baytlari.
2. `multipart/form-data`: `chunk_index`, `chunk_hash`, `file`.

`chunk_hash` opsiyoneldir; verilirse dogrulanir, tutmazsa `422 checksum_mismatch`.
Parca boyutu son parca haric tam `chunk_size` olmalidir. Ayni parcanin tekrar gonderilmesi
guvenlidir (idempotent).

```json
{ "upload_id": "u_9f3a...", "chunk_index": 0, "received_bytes": 2451234,
  "received_chunks": 1, "total_chunks": 1 }
```

## POST /api/uploads/{upload_id}/complete

Govde yok. Parcalar birlestirilir, SHA-256 dogrulanir, dosya atomik olarak hedefe tasinir.

```json
{
  "upload_id": "u_9f3a...", "transfer_id": "t_71bc...", "status": "COMPLETED",
  "verified": true, "stored_filename": "rapor (1).pdf", "target_id": "belgeler",
  "sha256": "a1b2c3...", "size": 2451234
}
```
- Cakisma politikasi `skip` ise `status` `CANCELLED` olur.
- Hash uyusmazsa `422 checksum_mismatch` doner ve transfer `FAILED` olur; hedefe yazilmaz.
- Eksik parca varsa `409 conflict`.

## DELETE /api/uploads/{upload_id}

`204`. Gecici parcalar silinir, transfer `CANCELLED` olur.

## GET /api/transfers

Sorgu parametreleri: `status`, `target_id`, `q`, `limit` (varsayilan 50), `offset`.

```json
{
  "items": [{
    "id": "t_71bc...", "device_id": "a3f1...", "target_id": "belgeler",
    "original_filename": "rapor.pdf", "stored_filename": "rapor (1).pdf",
    "size": 2451234, "mime_type": "application/pdf", "sha256": "a1b2c3...",
    "status": "COMPLETED", "verified": true,
    "started_at": "...", "completed_at": "...", "duration": 3.4,
    "average_speed": 720951.2, "error_message": null
  }],
  "total": 1
}
```
`status` degerleri (PRD §26): `QUEUED`, `PREPARING`, `UPLOADING`, `VERIFYING`,
`COMPLETED`, `FAILED`, `CANCELLED`.

## GET /api/transfers/{transfer_id}

Tek `TransferResponse`.

## GET /api/stats

Istatistik ozeti (PRD §42/§43). **Yalnizca `COMPLETED` transferler sayilir**
(`FAILED`, `CANCELLED`, `PREPARING` dahil edilmez). Gun sinirlari UTC ile hesaplanir.

```json
{
  "today":     { "files": 3, "bytes": 15728640, "avg_speed": 842137.5 },
  "week":      { "files": 10, "bytes": 52428800, "avg_speed": 500000.0 },
  "month":     { "files": 42, "bytes": 209715200, "avg_speed": 600000.0 },
  "total":     { "files": 137, "bytes": 536870912, "avg_speed": 555000.0 },
  "daily":     [ { "date": "2026-08-08", "files": 3, "bytes": 15728640 } ],
  "top_targets": [ { "target_id": "belgeler", "name": "Belgeler", "files": 2, "bytes": 1024 } ],
  "file_types": [ { "mime_type": "application/pdf", "files": 2, "bytes": 1024 } ],
  "by_device": [ { "device_id": "a3f1...", "name": "iPhone Test", "files": 3, "bytes": 1024 } ]
}
```

- `today` / `week` / `month` / `total`: bugun 00:00 UTC'den itibaren, son 7 gun, son 30 gun
  ve tum zamanlar. `avg_speed` o penceredeki `average_speed` ortalamasidir; veri yoksa `null`.
- `daily`: **son 14 gunun** surekli serisi (`YYYY-MM-DD`); bos gunler `files: 0, bytes: 0`.
- `top_targets`: hedefe gore dagilim, `bytes` DESC, en fazla 5 kayit. Hedef silinmis ise
  `name` yerine `target_id` doner (LEFT JOIN fallback).
- `file_types`: MIME tipine gore dagilim, `bytes` DESC, en fazla 8 kayit. MIME bilinmiyorsa
  `application/octet-stream` olarak gruplanir.
- `by_device`: cihaza gore dagilim, `bytes` DESC, en fazla 5 kayit. Cihaz silinmis ise
  `name` yerine `device_id` doner.

## GET /api/settings — PUT /api/settings

```json
{
  "device_name": "UMUT-PC",
  "chunk_size": 8388608,
  "max_file_bytes": 10737418240,
  "max_total_transfer_bytes": 53687091200,
  "conflict_policy": "rename",
  "naming_template": "",
  "remember_last_target": true,
  "telemetry_enabled": false,
  "ai_enabled": false,
  "notify_enabled": false
}
```
- `conflict_policy`: `rename` (varsayilan, `rapor.pdf` → `rapor (1).pdf`), `overwrite`,
  `skip`, `version`.
- `naming_template` degiskenleri: `{date} {time} {device} {folder} {original} {counter} {extension}`.
- `ai_enabled` / `notify_enabled` **MVP disidir** ve varsayilan kapalidir.
- `PUT` kismi guncelleme kabul eder; bilinmeyen alan `422`.

## WebSocket: /api/ws

Tarayici WebSocket'i baslik gonderemedigi icin token sorgu parametresiyle verilir:
`ws://<pc-ip>:8765/api/ws?token=<token>`. Basarisiz kimlik dogrulamada baglanti
`4401` koduyla kapanir.

Olaylar:
```json
{ "event": "receiver.online", "data": { "device_name": "UMUT-PC", "version": "1.0.0" } }
{ "event": "transfer.started",  "data": { "transfer_id": "...", "filename": "rapor.pdf" } }
{ "event": "transfer.progress", "data": { "transfer_id": "...", "received_bytes": 123, "size": 456 } }
{ "event": "transfer.completed","data": { "transfer_id": "...", "stored_filename": "rapor (1).pdf" } }
{ "event": "transfer.failed",   "data": { "transfer_id": "...", "code": "checksum_mismatch" } }
{ "event": "device.paired",     "data": { "device_id": "...", "device_name": "iPhone 15" } }
```

## Statik PWA

`/` ve bilinmeyen tum yollar `apps/web` static export ciktisindaki `index.html`'e duser
(SPA fallback). Build yoksa bilgilendirme sayfasi gosterilir. `sw.js`, `index.html` ve
`manifest.webmanifest` **cache'lenmez**; hash'li varliklar uzun sureli cache'lenir.
`/api/*` bu davranistan etkilenmez; bilinmeyen API yolu JSON `404` doner.

---
Urun sahibi: Umut Celik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
