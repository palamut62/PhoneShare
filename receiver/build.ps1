# PyInstaller ile receiver'i "onedir" olarak derler.
#
# NEDEN onedir: onefile modu her acilista kendini gecici bir dizine cikarir
# (self-extraction), bu yuzden soguk acilis ~23 saniye suruyordu. onedir
# modunda cikarma adimi yok; ayni receiver ~0.8-4.6 saniyede ayaga kalkiyor.
#
# Onedir modu tek bir exe degil, bir KLASOR uretir (exe + _internal/).
# Uretilen `dist/phoneshare-receiver/` klasoru Tauri tarafinda `externalBin`
# yerine `resources` ile paketlenir; bkz.
# `apps/desktop/src-tauri/tauri.conf.json` icindeki `resources` girisi.
#
# NEDEN izole venv: global python ortamindaki alakasiz paketler (IPython,
# jedi, parso, Cython, lxml, prompt_toolkit, werkzeug, cryptography vb.)
# PyInstaller tarafindan pakete siziyor, bu da cikti boyutunu ve dosya yolu
# uzunluklarini sisiriyordu; sonucta NSIS paketlemesinde Windows MAX_PATH
# asimi hatasi olusuyordu. Temiz bir venv bu sorunu ortadan kaldirir.

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    python -m venv .venv
}

& $venvPython -m pip install --upgrade pip -q
& $venvPython -m pip install -q ".[windows]" pyinstaller

& $venvPython -m PyInstaller `
    --noconfirm --clean `
    --name phoneshare-receiver `
    --paths src `
    --distpath dist `
    --workpath build/work `
    --specpath build `
    --console `
    --exclude-module tkinter `
    --exclude-module numpy `
    --exclude-module PIL `
    --exclude-module pytest `
    --exclude-module matplotlib `
    --hidden-import aiosqlite `
    --hidden-import uvicorn.logging `
    --hidden-import uvicorn.loops.auto `
    --hidden-import uvicorn.protocols.http.auto `
    --hidden-import uvicorn.protocols.websockets.auto `
    --hidden-import uvicorn.lifespan.on `
    --hidden-import multipart `
    --hidden-import zeroconf `
    build_entry.py

if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller derlemesi basarisiz oldu (exit code $LASTEXITCODE)."
}

$exePath = Join-Path $PSScriptRoot "dist\phoneshare-receiver\phoneshare-receiver.exe"
if (Test-Path $exePath) {
    $sizeMb = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
    Write-Host "Derleme tamamlandi: $exePath ($sizeMb MB)"
} else {
    Write-Host "Uyari: beklenen cikti bulunamadi: $exePath"
}
