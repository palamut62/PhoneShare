# PRD.md — PhoneShare PWA

## 1. Ürün Özeti

- **Ürün Adı:** PhoneShare
- **Ürün Tipi:** Progressive Web App (PWA) + Windows Local Receiver
- **Ana Amaç:** iPhone'da bulunan dosya, fotoğraf, video ve belgelerin web uygulaması üzerinden
  kullanıcının Windows bilgisayarındaki seçilmiş klasörlere hızlı ve güvenli biçimde aktarılması.

PhoneShare tamamen web tabanlı olacaktır. Projede **kullanılmayacaktır**:

- Swift
- Xcode
- Capacitor
- Native iOS uygulaması
- App Store
- Mac
- iOS Share Extension

Projenin tamamı Windows üzerinde geliştirilebilmelidir.

## 2. Temel Kullanım Senaryosu

```text
WhatsApp → PDF/Fotoğraf/Video → iPhone'a indir → PhoneShare PWA → Dosya Seç
→ Hedef Bilgisayar → Hedef Klasör → Gönder → Windows PC → D:\PhoneShare\...
```

WhatsApp doğrudan PhoneShare'a paylaşım yapmayacaktır. Kullanıcı dosyayı önce Dosyalar veya
Fotoğraflar uygulamasına kaydeder, sonra PhoneShare üzerinden seçer.

## 3. Temel Tasarım İlkeleri

1. Mobile-first tasarım
2. iPhone/Safari öncelikli
3. Minimum işlemle dosya gönderme
4. Bulut depolama zorunluluğu olmaması
5. Dosyaların doğrudan kullanıcının bilgisayarına aktarılması
6. Basit kurulum
7. Yüksek transfer performansı
8. Güvenli cihaz eşleştirme
9. Büyük dosya desteği
10. Transfer hatalarında veri kaybının önlenmesi
11. Masaüstü ve mobil uyumluluk
12. Kullanıcının teknik bilgi gerektirmeden sistemi kullanabilmesi

## 4. Sistem Mimarisi

```text
iPHONE (WhatsApp / Photos / Files / Safari)
        ↓
PhoneShare PWA  (Next.js, React, TypeScript, Service Worker, IndexedDB)
        ↓ HTTPS
Tailscale / LAN
        ↓
WINDOWS PC — PhoneShare Receiver (FastAPI, Python, SQLite)
        ↓
Windows Dosya Sistemi:  D:\PhoneShare\  D:\Projeler\  D:\Belgeler\  D:\Fotoğraflar\
```

## 5. Teknoloji Yığını — Frontend

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, React Hook Form, Zod.
PWA: Web App Manifest, Service Worker, Cache API, IndexedDB.

## 6. Backend

PC üzerinde çalışan local receiver: Python, FastAPI, Uvicorn, Pydantic, SQLAlchemy, SQLite, WebSocket.
Backend doğrudan Windows dosya sistemine yazabilmelidir.

## 7. Windows Receiver

Windows bilgisayarda sürekli çalışan küçük bir servis:

```text
PhoneShare Receiver
Status: ONLINE          Port: 8765
Connected Devices: 1    Default Folder: D:\PhoneShare
Today: 38 files         Transferred: 1.82 GB
```

Windows başladığında Receiver otomatik başlayabilmelidir.

## 8. Windows Sistem Tepsisi

```text
PhoneShare
● Receiver Online
iPhone ● Connected
──────────────
Web Panelini Aç / Gelen Dosyalar / Klasörü Aç / Ayarlar / Receiver'ı Durdur / Çıkış
```

## 9. Windows Paketleme

Tercihen **Tauri**. Alternatif: PyInstaller. Tauri tercih edilirse frontend React tabanlı olacaktır.
Python FastAPI servisi sidecar olarak çalıştırılabilir.

## 10. İlk PC Kurulumu

`PhoneShare-Setup.exe` çalıştırılır:

1. PhoneShare kurulur
2. Receiver servisi hazırlanır
3. Firewall gerekli izinleri ister
4. Varsayılan klasör oluşturulur
5. Veritabanı hazırlanır
6. Kullanıcıdan ana klasör seçmesi istenir (varsayılan `D:\PhoneShare`)

## 11. iPhone Kurulumu

Kullanıcı PhoneShare adresini Safari'de açar → Paylaş → Ana Ekrana Ekle.
Uygulama iPhone ana ekranında "PhoneShare" adıyla, standalone PWA modunda açılmalıdır.

## 12. İlk Cihaz Eşleştirme

PC "Yeni Telefon Ekle" seçeneği sunar, QR kod oluşturulur:

```text
[ QR CODE ]   Kod: 482-193   5 dakika geçerli
```

iPhone PWA: "Bilgisayar Ekle" → QR Kod Tara veya Eşleştirme Kodu gir → Bağlan.

## 13. Cihaz Kimlik Doğrulaması

Başarılı eşleştirmeden sonra device token oluşturulur, tarayıcıda güvenli saklanır.
Her cihaz için: Device ID, Device Name, Token, Created At, Last Connected, Status.

## 14. iPhone Ana Ekranı (mobile-first zorunlu)

```text
PhoneShare                    ⚙️
● UMUT-PC  Online

┌────────────────────────┐
│    + DOSYA GÖNDER      │
└────────────────────────┘
[ 📷 Fotoğraf Gönder ]

Hedef:  Akpazar Projesi  ▼

SON TRANSFERLER
✓ rapor.pdf   ✓ IMG_3847.jpg   ✓ tutanak.docx
```

## 15. Dosya Seçme

"Dosya Gönder" iOS sistem dosya seçicisini açmalıdır. Tek veya birden fazla dosya seçilebilmeli,
mümkün olan yerlerde `multiple` kullanılmalıdır.

## 16. Fotoğraf Seçme

Ayrı "Fotoğraf / Video Gönder" butonu. Fotoğraflar kütüphanesinden bir veya birden fazla medya.

## 17. Kamera

"Fotoğraf Çek" özelliği (saha kullanımı için önemli):
PhoneShare → Fotoğraf Çek → iPhone Kamera → Fotoğraf → Hedef seç → Gönder.

## 18. Dosya Önizleme

```text
Gönderilecek Dosyalar
IMG_3828.jpg 4.8 MB / IMG_3829.jpg 5.2 MB / rapor.pdf 12.4 MB
──────────────  3 Dosya  22.4 MB
```

## 19. Hedef Bilgisayar

Birden fazla bilgisayar desteklenmelidir (İş Bilgisayarı / Ev Bilgisayarı / Laptop).

## 20. Hedef Klasör

PC'de kullanıcı **sanal hedefler** oluşturabilmelidir (Genel, Fotoğraflar, Belgeler, Projeler,
Akpazar, Hakediş, İhaleler). PWA kullanıcısına gerçek Windows yolu göstermek zorunlu değildir:
"Akpazar Projesi" arka planda `D:\DSI\Projeler\Akpazar\` olabilir.

## 21. Favori Hedefler

★ Akpazar, ★ Genel, ★ Fotoğraflar — ana ekranda gösterilmelidir.

## 22. Son Kullanılan Hedef

Uygulama son kullanılan klasörü hatırlamalı ve otomatik seçili getirmelidir.

## 23. Hızlı Gönder

Opsiyonel mod: Dosya seç → son kullanılan klasör → otomatik gönder (ekstra onay ekranı yok).

## 24. Transfer Ekranı

```text
rapor.pdf   ████████████████░░░░  %82
10.2 MB / 12.4 MB   8.3 MB/s   Kalan: 1 sn   [ İptal ]
```

## 25. Çoklu Dosya Transferi

```text
24 Dosya   14 / 24 tamamlandı   ████████████░░░░ %61
120 MB / 198 MB   Transfer: 18 MB/s
```

## 26. Transfer Kuyruğu

Durumlar: `QUEUED`, `PREPARING`, `UPLOADING`, `VERIFYING`, `COMPLETED`, `FAILED`, `CANCELLED`.

## 27. Chunk Upload

Büyük dosyalar tek HTTP isteği ile gönderilmemeli, parçalara ayrılmalıdır.
Chunk boyutu yapılandırılabilir, **varsayılan 8 MB**.

## 28. Resume Upload

Bağlantı koparsa transfer baştan başlamamalıdır. Backend hangi chunk'ların geldiğini tutmalıdır.

## 29. Dosya Bütünlüğü

Aktarım sonrası **SHA-256** doğrulaması. Telefon ve PC hash'i aynıysa `VERIFIED` durumuna geçilir.

## 30. Geçici Dosya Sistemi

Dosya tamamen gelmeden nihai klasöre yazılmamalıdır:
`D:\PhoneShare\.temp\abc123.part` → SHA-256 doğrulama → `D:\Projeler\Akpazar\rapor.pdf`

## 31. Dosya Çakışmaları

Seçenekler: Yeni İsim Oluştur (**varsayılan**), Üzerine Yaz, Atla.
Örnek: `rapor.pdf` → `rapor (1).pdf` → `rapor (2).pdf`

## 32. Otomatik Dosya Adlandırma

Şablon örneği `{date}_{original}` → `2026-08-07_IMG_3847.jpg`
Değişkenler: `{date}` `{time}` `{device}` `{folder}` `{original}` `{counter}` `{extension}`

## 33. Klasör Kuralları

Dosya tipi = PDF → Belgeler; Uzantı = JPG → Fotoğraflar.

## 34. Kural Öncelikleri

Kurallar sıralanabilmelidir; ilk eşleşen kural uygulanır.

## 35. Windows Klasör Yönetimi

```text
Hedefler
Akpazar      D:\DSI\Projeler\Akpazar
Belgeler     D:\Belgeler
Fotoğraflar  D:\Fotoğraflar
+ Yeni Hedef
```

## 36. Yeni Hedef Oluşturma

Hedef Adı, Windows Klasörü (**native folder picker**), ☑ Favori, [ Kaydet ]

## 37. Transfer Geçmişi — tutulacak bilgiler

Dosya adı, orijinal dosya adı, boyut, MIME type, uzantı, gönderen cihaz, hedef, gerçek dosya yolu,
başlangıç zamanı, bitiş zamanı, transfer süresi, ortalama hız, SHA-256, durum.

## 38. Transfer Geçmişi UI

```text
Transferler — Bugün
✓ IMG_2817.jpg  Akpazar  5.2 MB  11:32
✓ rapor.pdf     Belgeler 14.8 MB 10:21
✕ video.mov     Genel    812 MB  Transfer başarısız
```

## 39. Yeniden Gönder

Başarısız transferlerde "Tekrar Dene" bulunmalıdır.

## 40. Windows'ta Dosyayı Aç

PC arayüzünde "Dosyayı Aç" ve "Klasörde Göster" işlemleri.

## 41. Arama

Dosya adı, tarih, dosya tipi, cihaz, hedef, durum üzerinden arama.

## 42. Dashboard (PC)

Receiver durumu, bugünkü dosya/veri, bağlı cihazlar, son transferler.

## 43. İstatistikler

Bugün/haftalık/aylık/toplam dosya, toplam veri, ortalama hız, en çok kullanılan hedef, dosya türleri.

## 44. Bağlantı Durumu

PWA sürekli PC bağlantısını kontrol etmelidir: `● UMUT-PC Online` / `● UMUT-PC Offline`

## 45. Health Endpoint

`GET /api/health` → `{"status": "online", "version": "1.0.0"}`

## 46. WebSocket

PC online/offline, transfer ilerlemesi, transfer tamamlandı/hata, cihaz durumu.

## 47. LAN Kullanımı

iPhone → Wi-Fi → Router → Windows PC doğrudan bağlantı desteklenmelidir.

## 48. Tailscale Kullanımı

Uzak bağlantı için Tailscale **önerilen yöntem**. Portların doğrudan internete açılması varsayılan
mimari olmamalıdır.

## 49. Güvenlik Modeli

Sistem internete açık klasik upload sunucusu gibi tasarlanmamalıdır. Katmanlar:
Tailscale/LAN, Device Pairing, Device Token, HTTPS, API Authentication, Path Validation,
File Validation, Rate Limiting, Size Limits, Audit Logging.

## 50. Path Traversal Koruması

`../../../Windows/System32/test.exe` gibi saldırılar engellenmelidir. Backend yalnızca önceden
tanımlanmış hedef klasörlerin altına yazabilmelidir.

## 51. Dosya Adı Temizleme

Geçersiz Windows karakterleri: `< > : " / \ | ? *`
Reserved isimler: `CON PRN AUX NUL COM1 LPT1` vb.

## 52. Dosya Boyutu Limitleri

Varsayılan: tek dosya **10 GB**, toplam transfer **50 GB**. PC ayarlarından değiştirilebilir.

## 53. Disk Alanı Kontrolü

Upload başlamadan önce kontrol edilmeli; yetersizse transfer başlamamalı:
"Bilgisayarda yeterli disk alanı bulunmuyor."

## 54. PWA Offline Durumu

PC offline ise kullanıcı dosya seçebilmeli, işlem "Bekliyor" durumuna alınmalıdır. Ancak büyük
dosyaların tarayıcıda uzun süre güvenilir saklanacağı varsayılmamalıdır. Kullanıcıya açıkça:
"Bilgisayar çevrimdışı. Gönderim için bilgisayarın çevrimiçi olması gerekiyor."

## 55. iOS Kısıtlarının Kabulü

PhoneShare native iOS uygulaması değildir. `WhatsApp → Paylaş → PhoneShare` entegrasyonu proje
gereksinimi **değildir**. Doğru kullanım: WhatsApp → Dosyayı indir → PhoneShare → Dosya seç → Gönder.

## 56. iOS Background Kısıtları

Safari/PWA'nın sınırsız arka plan transferi yapacağı varsayılmamalıdır. Büyük transferde uyarı:
"Transfer tamamlanana kadar PhoneShare'ı açık tutmanız önerilir."
Mimari, desteklenmeyen native özellikleri taklit etmeye çalışmamalıdır.

## 57. API Tasarımı

```text
GET    /api/health
POST   /api/pair
POST   /api/pair/confirm
GET    /api/devices
DELETE /api/devices/{id}
GET    /api/targets
POST   /api/targets
PUT    /api/targets/{id}
DELETE /api/targets/{id}
POST   /api/uploads/init
POST   /api/uploads/{id}/chunk
POST   /api/uploads/{id}/complete
DELETE /api/uploads/{id}
GET    /api/transfers
GET    /api/transfers/{id}
GET    /api/settings
PUT    /api/settings
```

## 58. Upload Init

Request:
```json
{ "filename": "rapor.pdf", "size": 15728640, "mime_type": "application/pdf",
  "target_id": "akpazar", "sha256": "..." }
```
Response:
```json
{ "upload_id": "uuid", "chunk_size": 8388608, "existing_chunks": [] }
```

## 59. Chunk Upload

`POST /api/uploads/{upload_id}/chunk` — gerekli: upload_id, chunk_index, chunk_hash, binary_data.

## 60. Upload Complete

`POST /api/uploads/{upload_id}/complete` → chunk kontrolü → birleştirme → SHA-256 hesapla →
client hash ile karşılaştır → hedef klasöre taşı → transfer kaydını COMPLETED yap.

## 61. Veritabanı

SQLite. Tablolar: `devices`, `targets`, `transfers`, `uploads`, `upload_chunks`, `rules`,
`settings`, `audit_logs`.

## 62. Device Tablosu

`id, name, token_hash, created_at, last_seen, enabled` — token plaintext saklanmamalıdır.

## 63. Target Tablosu

`id, name, path, icon, favorite, created_at, updated_at, enabled`

## 64. Transfer Tablosu

`id, device_id, target_id, original_filename, stored_filename, size, mime_type, sha256, status,
started_at, completed_at, duration, average_speed, error_message`

## 65. Audit Log

`DEVICE_PAIRED, DEVICE_REMOVED, UPLOAD_STARTED, UPLOAD_COMPLETED, UPLOAD_FAILED, TARGET_CREATED,
TARGET_CHANGED, SETTINGS_CHANGED, AUTH_FAILED`

## 66. Loglarda Hassas Veri

Token, parola, tam authentication header ve gizli anahtarlar loglara yazılmamalıdır.

## 67. UI Tasarım Dili

Modern, minimal, hızlı, temiz, mobile-first. Gereksiz dashboard karmaşası oluşturulmamalıdır.
**Dosya gönderme işlemi ana odak olmalıdır.**

## 68. Tema

System / Light / Dark. PWA iOS sistem temasını takip edebilmelidir.

## 69. Responsive Breakpoints

375px, 390px, 393px, 430px, 768px, 1024px, 1440px, 1920px

## 70. Mobil UX

Ana işlem tek elle yapılabilmeli. "DOSYA GÖNDER" butonu kolay erişilebilir bölgede.
Dokunma hedefleri minimum ~44px.

## 71. Hata Mesajları

Kötü: `ECONNREFUSED 100.68.4.21:8765`
İyi: "Bilgisayara ulaşılamıyor. UMUT-PC'nin açık ve PhoneShare Receiver'ın çalışıyor olduğundan
emin olun. [Tekrar Dene]"

## 72. Transfer Tamamlanma Bildirimi

```text
✓ Transfer Tamamlandı
rapor.pdf — Akpazar Projesi — 15.8 MB
[Başka Dosya Gönder]
```
Desteklenen platformlarda web notification opsiyonel.

## 73. Son Hedefi Hatırla

☑ Son kullanılan hedefi hatırla — varsayılan açık.

## 74. Dosya Gönderme Presetleri

📷 Şantiye Fotoğrafı → Akpazar/Fotoğraflar · 📄 Hakediş → Akpazar/Hakediş · 📑 Genel Belge → Belgeler

## 75. QR ile Hedef Seçme — Gelecek Özellik

PC'deki belirli klasör için QR oluşturulabilir; okutulduğunda hedef seçili gelir.

## 76. AI Özellikleri

**MVP'nin zorunlu parçası değildir.** V2/V3. Kullanıcı onayı olmadan kritik dosya taşıma yapılmamalıdır.

## 77. Local AI

İleride Ollama (Qwen, Gemma) ile dosya sınıflandırma, isim önerme, kategori belirleme.
Tamamen opsiyonel olmalıdır.

## 78. OCR

İleride PDF OCR, Fotoğraf OCR, belge sınıflandırma. **MVP kapsamına alınmamalıdır.**

## 79. MVP

1. Windows Receiver kurulumu 2. FastAPI server 3. PWA 4. iPhone'dan dosya seçme
5. iPhone'dan fotoğraf seçme 6. PC ile eşleşme 7. Hedef klasör seçme 8. Dosya gönderme
9. Chunk upload 10. Transfer progress 11. SHA-256 verification 12. Transfer history
13. Multiple file upload 14. Retry 15. LAN bağlantısı 16. Tailscale bağlantısı
17. PWA install 18. Responsive iPhone UI

**MVP tamamlanmadan AI/OCR gibi özelliklere başlanmamalıdır.**

## 80. Geliştirme Aşamaları

- **Phase 1 — Core Receiver:** FastAPI, SQLite, target folders, upload API, chunk upload, SHA-256
- **Phase 2 — PWA:** Next.js, responsive UI, file picker, photo picker, upload, progress
- **Phase 3 — Pairing:** QR, device token, authentication, device management
- **Phase 4 — Reliability:** resume, retry, multiple files, error handling, disk check, file collision
- **Phase 5 — Windows Desktop:** Tauri, system tray, auto-start, folder picker, settings
- **Phase 6 — Remote Access:** Tailscale, HTTPS, connection detection
- **Phase 7 — Polish:** dark mode, animations, transfer history, statistics, presets, rules

## 81. Test Gereksinimleri

Unit: filename sanitization, path validation, authentication, chunk management, hash verification,
rule engine. Integration: PWA → FastAPI → File → SQLite.

## 82. E2E Test

Gerçek iPhone Safari üzerinde mutlaka test edilmelidir: PDF, JPG, HEIC, MOV, ZIP, DOCX, XLSX,
çoklu fotoğraf, 1 MB / 100 MB / 1 GB+, bağlantı kopması, PC offline, disk dolu, aynı dosya adı,
token iptali.

## 83. Güvenlik Testleri

path traversal, unauthorized upload, invalid token, oversized request, malformed chunk,
duplicate chunk, corrupted file, filename injection, MIME spoofing, brute force pairing, rate limit.

## 84. Performans

LAN'da amaç mümkün olan en yüksek yerel ağ performansı. Sabit `100 MB/s` gibi **garanti
verilmemelidir**; performans iPhone, Wi-Fi standardı, router, PC, disk, dosya boyutu ve tarayıcıya
bağlıdır.

## 85. Kaynak Kullanımı

Receiver boşta iken CPU ≈ %0, RAM < 200 MB. Performans için yapay kısıt uygulanmamalıdır.

## 86. Veri Gizliliği

Dosya iPhone → PC arasında aktarılmalıdır. PhoneShare'a ait merkezi bir bulut sunucu dosyanın
içeriğini saklamamalıdır.

## 87. Telemetri

Varsayılan **OFF**. Kullanıcı açıkça izin vermeden dosya adı, içerik, klasör, kişisel veri
toplanmamalıdır.

## 88. Backup

`phoneshare.db` manuel yedeklenebilmeli, ayarlar dışa aktarılabilmelidir.

## 89. Import / Export

"PhoneShare Settings Backup": targets, rules, preferences.
**Device token'lar güvenlik nedeniyle export edilmemelidir.**

## 90. Güncelleme Sistemi

İleride otomatik update. Update başarısız olursa mevcut çalışan sürüm bozulmamalıdır.

## 91. Kod Kalitesi

TypeScript `strict = true`. Python: type hints, Pydantic validation, formatter, linter.
Kod modüler tutulmalıdır.

## 92. Repository Yapısı

```text
phoneshare/
├── apps/
│   ├── web/          (app, components, features, hooks, lib, services, stores, public, tests)
│   └── desktop/      (src, src-tauri)
├── receiver/         (api, core, models, schemas, services, storage, security, database, tests)
├── packages/
│   ├── shared-types/
│   └── shared-config/
├── docs/             (architecture.md, api.md, security.md, deployment.md)
├── scripts/
├── .github/workflows/
├── README.md
└── PRD.md
```

## 93. Kodlama Kuralı

Frontend hiçbir zaman gerçek Windows klasörüne doğrudan erişmeye çalışmamalıdır.
Frontend `target_id = "akpazar"` gönderir; backend bunu `D:\DSI\Projeler\Akpazar` yoluna çevirir.
**Backend dosya sisteminin tek otoritesi olmalıdır.**

## 94. Kritik Mimari Karar

Dosya aktarımı `iPhone → Merkezi Cloud → PC` şeklinde **olmamalıdır**.
Tercih: `iPhone → LAN/Tailscale → Windows Receiver → Local Disk`

## 95. Uygulamanın Nihai Kullanımı

WhatsApp → Dosyalara Kaydet → PhoneShare → + Dosya Gönder → iOS Files → rapor.pdf seç →
hedef "Akpazar Projesi" → GÖNDER → %100 → ✓ Transfer Tamamlandı →
`D:\DSI\Projeler\Akpazar\rapor.pdf`

## 96. Definition of Done

MVP ancak şu gerçek cihaz senaryosu sorunsuz çalıştığında tamamlanmış sayılır:
WhatsApp → iPhone'a kaydet → PWA aç → dosya seç → hedef seç → gönder → LAN/Tailscale →
Receiver → hash doğrulama → seçilen Windows klasörü → transfer geçmişine kayıt.
**Gerçek iPhone + gerçek Windows bilgisayar üzerinde test edilmeden proje tamamlanmış sayılmaz.**

## 97. Projede Kullanılmayacak Teknolojiler

Swift, SwiftUI, Xcode, Capacitor, iOS Share Extension, Native iOS Application, App Store deployment.
PhoneShare'ın iPhone istemcisi PWA/web uygulamasıdır.

## 98. Öncelik Sırası

1. Dosyanın güvenilir aktarılması 2. Windows klasörüne doğru kaydedilmesi 3. iPhone Safari/PWA
uyumluluğu 4. Güvenlik 5. Transfer devamlılığı 6. Kullanım kolaylığı 7. Performans 8. UI/UX
9. İstatistikler 10. Gelişmiş otomasyon 11. AI/OCR

Görsel özellikler temel dosya aktarım sisteminden önce geliştirilmemelidir.

## 99. Ana Başarı Kriteri

Kullanıcı iPhone'undaki bir dosyayı; kablo bağlamadan, e-posta göndermeden, buluta yüklemeden ve
Windows'ta manuel indirme yapmadan PhoneShare PWA üzerinden seçerek kendi bilgisayarındaki istediği
klasöre aktarabilmelidir.
