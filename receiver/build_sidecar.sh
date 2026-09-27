#!/usr/bin/env bash
# Tauri sidecar ikilisini temiz bir sanal ortamda uretir ve binaries/ altina kopyalar.
# aiosqlite/sqlite dialekti SQLAlchemy tarafindan dinamik import edildigi icin acikca toplanir.
set -euo pipefail
cd "$(dirname "$0")"
B="${BUILD_DIR:-${TMPDIR:-/tmp}/phoneshare-sidecar}"
python -m venv "$B/venv"
"$B/venv/Scripts/python" -m pip install -q . pyinstaller
"$B/venv/Scripts/python" -m PyInstaller --noconfirm --onefile --console \
  --name phoneshare-receiver --distpath "$B/dist" --workpath "$B/work" --specpath "$B" \
  --collect-submodules phoneshare_receiver --collect-submodules uvicorn \
  --collect-submodules aiosqlite --collect-submodules sqlalchemy.dialects.sqlite \
  --collect-submodules zeroconf --hidden-import greenlet \
  --add-data "$(pwd -W)/migrations;migrations" --add-data "$(pwd -W)/alembic.ini;." \
  build_entry.py
cp "$B/dist/phoneshare-receiver.exe" \
  ../apps/desktop/src-tauri/binaries/phoneshare-receiver-x86_64-pc-windows-msvc.exe
