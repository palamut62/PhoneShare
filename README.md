# PhoneShare

iPhone'dan Windows bilgisayardaki klasorlere, **bulut olmadan**, hizli ve dogrulanabilir
dosya gonderme sistemi. Dosyalar ve meta veriler yerel agdan disari cikmaz.

## Mimari ozet

**Tek backend** vardir: Windows'ta calisan FastAPI **receiver**. Merkezi kontrol duzlemi
(Vercel/Postgres) **yoktur**. iPhone istemcisi bir **PWA**'dir ve ayni receiver tarafindan
servis edilir — bu sayede mixed-content ve CORS sorunu olusmaz.

```
iPhone (Safari/PWA)  --HTTP/WS-->  Receiver (FastAPI + SQLite)  -->  D:\Hedef\Klasor
```

## Depo yapisi

```
receiver/            FastAPI + SQLite backend (Python paketi: phoneshare_receiver)
apps/web/            PWA (Next.js static export) — ayri gelistiriliyor
packages/
  shared-types/      Zod semalari, TS tipleri, API_ROUTES, kural motoru (TS kopyasi)
  shared-config/     Sabitler: chunk boyutu, limitler, durumlar, cakisma politikalari
docs/                architecture.md, api.md, security.md, deployment.md
scripts/             gen_cert.py, install_service.py, uninstall_service.py
```

## Hizli baslangic

```bash
# Backend
cd receiver
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m alembic -c alembic.ini upgrade head
.venv/Scripts/phoneshare-receiver run --host 0.0.0.0 --port 8765

# Paketler / PWA
pnpm install
pnpm -F @phoneshare/shared-types test
```

Telefondan `http://<pc-ip>:8765` adresini acin, PC'de uretilen 6 haneli kod (`482-193`)
veya QR ile eslestirin, "Ana Ekrana Ekle" ile PWA olarak kurun.
Ayrinti: [`docs/deployment.md`](docs/deployment.md).

## Temel ozellikler

- Chunk'li yukleme, kesintiden **devam** (resume) ve tekrar deneme
- Uctan uca **SHA-256 dogrulamasi**; uyusmazsa hedefe hicbir sey yazilmaz
- Sanal hedef klasorler; gercek Windows yolu istemciye gosterilmez
- Kural motoru ile otomatik hedef secimi ve otomatik adlandirma sablonlari
- Cakisma politikalari: yeni isim olustur (varsayilan), uzerine yaz, atla, surumle
- Path traversal / rezerve ad korumasi, hiz limiti, denetim kaydi
- Gercek zamanli ilerleme (WebSocket)

MVP disi (varsayilan **kapali**): AI siniflandirma ve bildirim entegrasyonlari.

## Dokumantasyon

| Belge | Icerik |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Katmanlar, yukleme akisi, veri modeli |
| [docs/api.md](docs/api.md) | Tum uc noktalar, ornek istek/yanitlar, hata sozlesmesi |
| [docs/security.md](docs/security.md) | Tehdit modeli, kimlik dogrulama, path guvenligi, denetim |
| [docs/deployment.md](docs/deployment.md) | Kurulum, otomatik baslatma, TLS, guvenlik duvari |

Urun gereksinimleri: [prd.md](prd.md) · Yol haritasi: [PLAN.md](PLAN.md)

## Dogrulama

```bash
cd receiver && .venv/Scripts/python -m pytest -q && .venv/Scripts/python -m ruff check .
pnpm -F @phoneshare/shared-types test
```

---
Urun sahibi: **Umut Celik (palamut62)** — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
