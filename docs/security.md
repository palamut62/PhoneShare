# PhoneShare — Guvenlik

## Tehdit modeli

Receiver, kullanicinin yerel agindaki bir Windows makinesinde calisir ve **dosya sistemine
yazar**. Bu nedenle temel tehditler: yetkisiz cihazin yazmasi, hedef klasor disina yazma
(path traversal), bozuk/degistirilmis dosyanin sessizce kaydedilmesi, kaynak tuketimi (DoS)
ve sirlarin loglara sizmasi.

## Kimlik dogrulama ve eslestirme (PRD §12/§13/§49)

- `POST /api/pair` bilgisayardan cagrilir; `NNN-NNN` bicimli 6 haneli kod uretir, **5 dakika**
  gecerlidir ve veritabaninda yalnizca **hash**'i saklanir.
- `POST /api/pair/confirm` kodu tuketir, cihaz kaydi ve uzun rastgele token (`secrets.token_urlsafe(32)`)
  uretir. Token **yalnizca bu yanitta** goruntulenir.
- `devices.token_hash` = SHA-256; **ham token asla saklanmaz**. Karsilastirma
  `hmac.compare_digest` ile sabit zamanlidir.
- Cihaz silindiginde (`DELETE /api/devices/{id}`) token aninda gecersizlesir.

### Brute force korumasi

- Her basarisiz `confirm` denemesi aktif eslestirme oturumlarinin sayacini artirir; **5**
  denemeden sonra oturum silinir (dogru kod bile artik calismaz).
- `pair` ve `pair/confirm` icin IP basina ayri hiz limiti (60 sn'de 10 istek) uygulanir.
- Suresi dolmus oturumlar her `pair` cagrisinda temizlenir.

## Yol ve dosya adi guvenligi (PRD §50/§51)

- Yazma **yalnizca** tanimli hedef koklerinin (allow-list) altina yapilir. Her yol
  `resolve()` ile cozulur (symlink/junction kacisi engellenir) ve kok altinda kalip
  kalmadigi kontrol edilir.
- Reddedilenler: goreli yollar, `..` traversal, UNC (`\\sunucu\pay`), genisletilmis cihaz
  yollari (`\\?\`), surucu degisimi, rezerve segment iceren yollar.
- Dosya adlarinda `< > : " / \ | ? *` ve kontrol karakterleri temizlenir; Windows rezerve
  adlari (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) donusturulur; sondaki nokta ve
  bosluk atilir; ad 255 karakterle sinirlanir ve **asla bos kalmaz** (`dosya`'ya duser).
- Nihai atomik tasima (`os.replace`) oncesinde hedef yol allow-list'e karsi **tekrar**
  dogrulanir (TOCTOU savunmasi).

## Butunluk (PRD §29/§30)

- Istemci `sha256` bildirir; parcalar birlestirildikten sonra sunucu hash'i yeniden hesaplar.
- Uyusmazlik: transfer `FAILED`, gecici dosyalar silinir, hedefe **hicbir sey yazilmaz**.
- Uyusma: `verified = true` ve atomik tasima.
- Parca duzeyinde opsiyonel `chunk_hash` dogrulamasi; hatali parca kabul edilmez.

## Kaynak korumasi (PRD §52/§53)

- Tek dosya limiti (varsayilan 10 GB) ve toplam es zamanli transfer limiti (varsayilan 50 GB).
- `init` asamasinda hedef surucude disk alani kontrolu; yetersizse `507` +
  "Bilgisayarda yeterli disk alani bulunmuyor."
- Istek govdesi `chunk_size + 64 KB`'i asarsa akis kesilir ve `413` doner.
- Istek sayisi ve bant genisligi icin hiz limitleri (`RequestRateLimiter`, `ByteRateLimiter`).
- Gecersiz/negatif/sinir disi `chunk_index` ve beklenenden farkli parca boyutu reddedilir.

## Denetim kaydi ve gizlilik (PRD §65/§66)

- Kaydedilen olaylar: `DEVICE_PAIRED`, `DEVICE_REMOVED`, `UPLOAD_STARTED`, `UPLOAD_COMPLETED`,
  `UPLOAD_FAILED`, `TARGET_CREATED`, `TARGET_CHANGED`, `SETTINGS_CHANGED`, `AUTH_FAILED`.
- Detay alanlari **ozyinelemeli olarak redakte edilir**: `token`, `secret`, `password`,
  `authorization`, `auth`, `api_key`, `code` iceren anahtarlar `***` ile degistirilir.
- Loglara ve HTTP yanitlarina token, parola veya `Authorization` basligi **yazilmaz**.
- Hicbir dosya veya meta veri disari gonderilmez; telemetri varsayilan **kapalidir**.
- Gercek Windows yollari istemci yanitlarinda yer almaz (PRD §93).

## Aktarim guvenligi

Yerel ag icin HTTP yeterlidir; harici erisim gerekiyorsa `scripts/gen_cert.py` ile
self-signed sertifika uretip TLS ile calistirin veya Tailscale gibi bir ozel ag kullanin.
PWA ve API ayni origin'de sunuldugu icin mixed-content olusmaz.

---
Urun sahibi: Umut Celik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
