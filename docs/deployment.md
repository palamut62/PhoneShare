# PhoneShare — Kurulum ve Calistirma

## Gereksinimler

- Windows 10/11
- Python 3.11+
- Node.js 20+ ve pnpm 9+ (yalnizca PWA/paketleri derlemek icin)

## Receiver kurulumu

```bash
cd receiver
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
```

Veritabani semasi:

```bash
.venv/Scripts/python -m alembic -c alembic.ini upgrade head
```

Calistirma:

```bash
.venv/Scripts/phoneshare-receiver run --host 0.0.0.0 --port 8765
# veya
.venv/Scripts/python -m phoneshare_receiver run
```

Diger komutlar:

```bash
phoneshare-receiver --version
phoneshare-receiver --about
phoneshare-receiver config --show
phoneshare-receiver config --set base_folder="D:\Depo" --set chunk_size=8388608
```

## Veri konumlari

| Icerik | Yol |
|---|---|
| Konfigurasyon | `%LOCALAPPDATA%\PhoneShare\config.json` |
| Veritabani | `%LOCALAPPDATA%\PhoneShare\data\phoneshare.db` |
| Loglar | `%LOCALAPPDATA%\PhoneShare\logs\` |
| Yedekler | `%LOCALAPPDATA%\PhoneShare\backups\` |
| Gecici parcalar | `<hedef_kok>\.temp\<upload_id>\` |

`PHONESHARE_HOME` ortam degiskeni ile tum bu kok degistirilebilir (testler bunu kullanir).

## PWA'yi servis etme

Receiver, PWA'nin static export ciktisini `/` altindan sunar. Arama sirasi:

1. `PHONESHARE_WEB_DIST` ortam degiskeni
2. `--web-dist` parametresi
3. Repo icindeki `apps/web/out` veya `apps/web/dist`

```bash
pnpm install
pnpm -F web build          # apps/web/out uretir
phoneshare-receiver run    # ciktiyi otomatik bulur
```

Build yoksa kibar bir bilgilendirme sayfasi gosterilir; API calismaya devam eder.

## Telefonu baglama

1. PC ve iPhone ayni agda olmalidir.
2. Safari'den `http://<pc-ip>:8765` adresini acin.
3. PC'de `POST /api/pair` (tray menusu / yerel arayuz) ile kod uretin.
4. Telefonda kodu girin veya QR'i okutun → cihaz eslesti.
5. "Ana Ekrana Ekle" ile PWA olarak kurun.

## Windows Guvenlik Duvari

Ilk calistirmada gelen baglantilara izin verin; ya da:

```powershell
New-NetFirewallRule -DisplayName "PhoneShare" -Direction Inbound -Protocol TCP -LocalPort 8765 -Action Allow -Profile Private
```

## Otomatik baslatma

```bash
python scripts/install_service.py     # Task Scheduler ONLOGON gorevi (yonetici gerekmez)
python scripts/uninstall_service.py
```

## TLS (opsiyonel)

```bash
python scripts/gen_cert.py --host 192.168.1.20
```
Sertifika `%LOCALAPPDATA%\PhoneShare\certs` altina yazilir ve konfigurasyona islenir.

## Gelistirme dogrulamasi

```bash
cd receiver && .venv/Scripts/python -m pytest -q
cd receiver && .venv/Scripts/python -m ruff check .
pnpm -F @phoneshare/shared-types test
```

---
Urun sahibi: Umut Celik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
