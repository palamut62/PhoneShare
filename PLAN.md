# PhoneShare — Uygulama Planı (PWA sürümü)

PRD: [prd.md](prd.md) — **v2, PWA tabanlı**. Swift/Xcode/Capacitor/native iOS YOK.

## Mimari

```
iPhone Safari (PWA, ana ekrana eklenmiş)
        │  HTTPS — LAN veya Tailscale
        ▼
Windows PC: PhoneShare Receiver (FastAPI + SQLite)
        │  ← PWA'nın statik dosyalarını da bu servis sunar (aynı origin, mixed-content yok)
        ▼
D:\PhoneShare\  D:\DSI\Projeler\Akpazar\  ...
```

**Merkezi bulut yok.** Backend, dosya sisteminin tek otoritesidir (PRD §93/§94).
Frontend yalnızca `target_id` gönderir, gerçek Windows yolunu asla görmez/kullanmaz.

## Repo yapısı (PRD §92)

```
apps/web/         PWA (Next.js static export) — receiver tarafından servis edilir
apps/desktop/     Tauri kabuk + tray + kurulum (Python sidecar)
receiver/         FastAPI + SQLite — tek backend
packages/shared-types/   Zod şemaları + TS tipleri (API sözleşmesi)
packages/shared-config/  sabitler (chunk boyutu, limitler, durum enum'ları)
docs/             architecture.md, api.md, security.md, deployment.md
scripts/
```

## v1'den (Vercel/Capacitor sürümü) taşınan karar

Önceki sürümdeki Vercel control plane (Next.js API + Postgres/Drizzle + auth) ve
`apps/mobile` (Capacitor + Swift Share Extension) **kaldırıldı**. Kural motoru, path güvenliği,
chunk/hash mantığı ve testleri yeni yapıya taşındı.

## Fazlar (PRD §80)

### Phase 1 — Core Receiver
FastAPI, SQLite (devices/targets/transfers/uploads/upload_chunks/rules/settings/audit_logs),
target yönetimi, `/api/uploads/*` chunk upload, `.temp` → SHA-256 doğrulama → hedef klasöre taşıma.

### Phase 2 — PWA
Next.js static export, mobile-first UI, dosya/fotoğraf/kamera seçici, upload kuyruğu, progress.

### Phase 3 — Pairing
QR + 6 haneli kod (`482-193`), device token, authentication, cihaz yönetimi.

### Phase 4 — Reliability
Resume, retry, çoklu dosya, hata yönetimi, disk kontrolü, dosya çakışması.

### Phase 5 — Windows Desktop
Tauri, system tray, auto-start, native folder picker, ayarlar, installer.

### Phase 6 — Remote Access
Tailscale, HTTPS, bağlantı algılama.

### Phase 7 — Polish
Dark mode, animasyonlar, transfer geçmişi, istatistikler, presetler, kurallar.

## MVP dışı (PRD §76-78)
AI sınıflandırma, Local AI (Ollama), OCR. Kod tabanında opsiyonel ve **varsayılan kapalı** kalır;
MVP tamamlanmadan geliştirilmez.

## Definition of Done (PRD §96)
Gerçek iPhone + gerçek Windows PC üzerinde uçtan uca test edilmeden proje tamamlanmış sayılmaz.
Bu test bu geliştirme ortamında **yapılamaz**; kullanıcı tarafından yapılmalıdır.

---
Ürün sahibi: Umut Çelik (palamut62) · [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
