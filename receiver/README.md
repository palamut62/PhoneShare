# PhoneShare Receiver

Windows uzerinde calisan **tek backend**: FastAPI + SQLite. iPhone'dan gelen dosyalari
chunk'lar halinde alir, SHA-256 ile dogrular ve hedef klasore atomik olarak yazar.
Ayrica PWA'yi (`apps/web` static export) ayni origin uzerinden servis eder.

## Kurulum

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m alembic -c alembic.ini upgrade head
.venv/Scripts/phoneshare-receiver run --host 0.0.0.0 --port 8765
```

## Paket yapisi (`src/phoneshare_receiver/`)

```
api/        FastAPI router'lari (routes/), deps.py, spa.py (PWA servisi)
core/       config, state, logging_setup, ratelimit, errors, normalize
models/     SQLAlchemy tablolari
schemas/    Pydantic v2 API sozlesmesi (snake_case)
services/   uploads, pairing, targets, rule_engine, rules, naming, discovery, tray, ws, backup
storage/    temp.py (chunk deposu), files.py (cakisma/kapasite/atomik tasima)
security/   paths, tokens, audit, secrets_store
database/   async engine + session
```

## MVP disi ozellikler

`services/ai/` ve `services/notify/` **MVP KAPSAMI DISINDADIR** ve **varsayilan olarak
KAPALIDIR** (`ai_enabled = false`, `notify_enabled = false` — bkz. `GET /api/settings`).
MVP'de bu moduller cagrilmaz; ileride opt-in olarak etkinlestirilecektir.

## Testler

```bash
.venv/Scripts/python -m pytest -q
.venv/Scripts/python -m ruff check .
```

Kapsam: dosya adi temizleme (rezerve adlar dahil), path traversal, kimlik dogrulama,
chunk yonetimi (tekrarli/bozuk/sira disi), hash dogrulama, kural motoru paritesi,
cakisma politikalari, disk yetersizligi, boyut limitleri, brute force eslestirme ve
uctan uca yukleme (resume dahil).

## Dokumantasyon

- API sozlesmesi: [`../docs/api.md`](../docs/api.md)
- Mimari: [`../docs/architecture.md`](../docs/architecture.md)
- Guvenlik: [`../docs/security.md`](../docs/security.md)
- Kurulum: [`../docs/deployment.md`](../docs/deployment.md)

---
Urun sahibi: Umut Celik (palamut62) — [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)
