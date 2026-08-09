# apps/web — PhoneShare PWA

iPhone istemcisi olan PWA (PRD §5 / §80 Phase 2 + Phase 7). Next.js App Router + **static export**;
cikti `apps/web/out/` receiver tarafindan `/` altindan **ayni origin** uzerinden servis edilir
(bkz. `receiver/src/phoneshare_receiver/api/spa.py`). SSR / route handler / server component yoktur.

## Komutlar

```bash
pnpm -F @phoneshare/web dev         # gelistirme (API icin receiver'a proxy gerekir)
pnpm -F @phoneshare/web test        # vitest — lib/upload birim testleri
pnpm -F @phoneshare/web typecheck   # tsc --noEmit
pnpm -F @phoneshare/web lint        # eslint
pnpm -F @phoneshare/web build       # ikon uretimi + static export -> out/
```

## Yapi

```
app/          layout + / (ana ekran), /transfers, /settings
components/   UI kabugu, eslestirme, dosya onizleme, kuyruk paneli
hooks/        health/WS, hedefler, transferler, upload kuyrugu
lib/upload/   saf TS upload istemcisi (chunk, artimli SHA-256, retry, kuyruk) + testler
lib/storage/  IndexedDB (cihaz token'i, tercihler, kuyruk meta verisi)
public/       manifest.webmanifest, sw.js, ikonlar (scripts/generate-icons.mjs uretir)
```

## Kurallar

- Tum istekler goreli `/api/...` yoluna gider; **mutlak URL / env tabanli base URL yoktur**.
- Frontend gercek Windows klasor yolunu **asla** gormez veya gondermez; yalnizca `target_id`
  kullanilir (PRD §93).
- Service Worker `/api/*` isteklerini **hicbir kosulda** onbellege almaz.
- Cihaz token'i IndexedDB'de tutulur; URL'e, log'a veya hata mesajina yazilmaz (PRD §66).
- Dosya **icerigi** tarayicida kalici saklanmaz; sayfa yenilenirse kullanicidan dosyayi tekrar
  secmesi istenir (PRD §54).

## API sozlesmesi

Tum uclar ve Zod semalari: `packages/shared-types/src/api.ts` (`API_ROUTES` sabitini kullanin).
Sabitler: `packages/shared-config`. Uc dokumantasyonu: [`docs/api.md`](../../docs/api.md).

## Test edilemeyenler

Gercek iPhone Safari uzerindeki PWA kurulumu, kamera/QR tarama ve 1 GB+ transfer davranisi
bu ortamda dogrulanamaz (PRD §82/§96) — gercek cihazda test edilmelidir.

---
Urun sahibi: Umut Çelik (palamut62) · [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
