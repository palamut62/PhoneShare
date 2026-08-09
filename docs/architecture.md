# PhoneShare — Mimari

## Genel bakis

PhoneShare, iPhone'dan Windows bilgisayardaki klasorlere dosya gonderme sistemidir.
**Tek bir backend** vardir: Windows uzerinde calisan FastAPI **receiver**. Merkezi bir
kontrol duzlemi (Vercel/Postgres) **YOKTUR**; hicbir dosya veya meta veri buluta gitmez.

```
iPhone (Safari / PWA)                Windows PC
+---------------------+              +--------------------------------------+
|  apps/web (PWA)     |  HTTP/WS     |  receiver (FastAPI + Uvicorn)        |
|  - dosya sec        +------------->+  /            -> PWA statik dosyalar |
|  - hedef sec        |  ayni origin |  /api/*       -> REST + WebSocket    |
|  - chunk yukle      |              |  SQLite (SQLAlchemy + Alembic)       |
+---------------------+              |  Hedef klasorler (D:\..., C:\...)    |
                                     +--------------------------------------+
```

PWA, receiver'in **kendisi tarafindan** servis edilir (`api/spa.py`). Boylece istemci ve
API ayni origin'dedir; mixed-content ve CORS sorunu olusmaz.

## Katmanlar (`receiver/src/phoneshare_receiver/`)

| Klasor | Sorumluluk |
|---|---|
| `api/` | FastAPI router'lari (`routes/`), bagimliliklar (`deps.py`), SPA servisi (`spa.py`) |
| `core/` | Konfigurasyon, uygulama durumu (`state.py`), loglama, hiz limiti, hata tipleri, metin normalize |
| `models/` | SQLAlchemy tablolari (devices, targets, transfers, uploads, upload_chunks, rules, settings, audit_logs, pairing_sessions) |
| `schemas/` | Pydantic v2 istek/yanit modelleri — API sozlesmesi (snake_case) |
| `services/` | Is mantigi: `uploads`, `pairing`, `targets`, `rule_engine`, `rules`, `naming`, `discovery`, `tray`, `ws`, `backup` |
| `storage/` | `temp.py` (chunk deposu, birlestirme, SHA-256), `files.py` (cakisma politikasi, kapasite, atomik tasima) |
| `security/` | `paths.py` (path/ad dogrulama), `tokens.py` (token/kod uretimi ve hash), `audit.py`, `secrets_store.py` |
| `database/` | Async engine/session yonetimi (aiosqlite, WAL, foreign_keys) |

MVP disi ve **varsayilan KAPALI**: `services/ai/`, `services/notify/`
(`ai_enabled`, `notify_enabled` ayarlari).

## Yukleme akisi (PRD §27-§32)

1. `POST /api/uploads/init` — ad temizlenir, boyut/limit/disk kontrolu yapilir, kural motoru
   hedefi belirler, devam eden bir yukleme varsa **ayni** `upload_id` ve `existing_chunks` doner.
2. `POST /api/uploads/{id}/chunk` — parca `<hedef_kok>\.temp\<upload_id>\NNNNNNNN.part`
   altina atomik yazilir. `chunk_hash` verilirse dogrulanir. Tekrarli gonderim idempotenttir.
3. `POST /api/uploads/{id}/complete` — parcalar birlestirilir, SHA-256 hesaplanir ve istemcinin
   bildirdigi degerle karsilastirilir.
   - Uyusmazsa: transfer `FAILED`, gecici dosyalar silinir, hedefe **hicbir sey yazilmaz**.
   - Uyusursa: adlandirma sablonu + cakisma politikasi uygulanir, dosya `os.replace` ile
     **atomik** olarak hedefe tasinir, transfer `COMPLETED` + `verified=true` olur.

Durum makinesi (PRD §26): `QUEUED -> PREPARING -> UPLOADING -> VERIFYING -> COMPLETED`
ile `FAILED` / `CANCELLED` uc durumlari.

## Veri modeli

SQLite, `%LOCALAPPDATA%\PhoneShare\data\phoneshare.db`. Semayi Alembic yonetir
(`receiver/migrations`). `devices.token_hash` yalnizca **hash** tutar; ham token asla
veritabaninda veya loglarda yer almaz.

## Gercek zamanli olaylar

`GET /api/ws` (WebSocket, `?token=`) uzerinden: `receiver.online`, `transfer.started`,
`transfer.progress`, `transfer.completed`, `transfer.failed`, `device.paired`.

## Paylasilan paketler

- `packages/shared-types` — Zod semalari + TS tipleri + `API_ROUTES` (PWA'nin sozlesmesi),
  kural motorunun TS kopyasi (onizleme icin; Python ile parite testleri mevcut).
- `packages/shared-config` — sabitler (chunk boyutu, limitler, durumlar, cakisma politikalari).

---
Urun sahibi: Umut Celik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
