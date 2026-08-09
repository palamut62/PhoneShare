"""PWA statik dosyalarini ayni origin uzerinden servis etme.

PWA (`apps/web`) static export ciktisi receiver tarafindan `/` altindan sunulur; boylece
mixed-content sorunu olusmaz. Build yoksa kibar bir bilgilendirme sayfasi gosterilir.
`/api/*` bu yonlendirmeden ETKILENMEZ (router once eklenir).
"""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path

from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

#: Service worker guncellemesi kacirilmasin diye ASLA cache'lenmez.
NO_CACHE_FILES = {"sw.js", "service-worker.js", "index.html", "manifest.webmanifest"}
NO_CACHE = "no-cache, no-store, must-revalidate"
IMMUTABLE = "public, max-age=31536000, immutable"

_PLACEHOLDER = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PhoneShare</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;min-height:100vh;
      display:grid;place-items:center;background:#0b0f19;color:#e6e9f0;padding:24px}
 main{max-width:32rem;text-align:center}
 h1{font-size:1.5rem;margin:0 0 .75rem}
 p{opacity:.75;line-height:1.6;margin:0 0 .5rem}
 code{background:#1b2233;padding:.15rem .4rem;border-radius:.35rem}
</style></head>
<body><main>
<h1>PhoneShare Receiver calisiyor</h1>
<p>Arayuz (PWA) henuz derlenmemis.</p>
<p><code>pnpm -F web build</code> komutunu calistirip receiver'i yeniden baslatin.</p>
<p><a href="/api/health" style="color:#7aa2ff">Durum kontrolu</a></p>
</main></body></html>
"""


def find_web_dist(explicit: str | None = None) -> Path | None:
    """PWA build ciktisini bulur: env > parametre > repo icindeki bilinen yollar."""
    candidates: list[Path] = []
    env = os.environ.get("PHONESHARE_WEB_DIST")
    if env:
        candidates.append(Path(env))
    if explicit:
        candidates.append(Path(explicit))
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidates.append(parent / "apps" / "web" / "out")
        candidates.append(parent / "apps" / "web" / "dist")
    for candidate in candidates:
        if candidate.is_dir() and (candidate / "index.html").is_file():
            return candidate
    return None


def _cache_headers(name: str, path: Path) -> dict[str, str]:
    if name in NO_CACHE_FILES or path.suffix == ".webmanifest":
        return {"Cache-Control": NO_CACHE}
    # Next.js hash'li varliklari uzun sureli cache'lenebilir.
    if "/_next/static/" in path.as_posix() or "/assets/" in path.as_posix():
        return {"Cache-Control": IMMUTABLE}
    return {"Cache-Control": "public, max-age=3600"}


def build_spa_router(dist: Path | None) -> APIRouter:
    """SPA fallback yonlendiricisi: bilinmeyen yol -> index.html."""
    router = APIRouter(include_in_schema=False)

    @router.get("/{full_path:path}")
    async def serve(full_path: str, request: Request) -> Response:  # noqa: ARG001
        relative = full_path.strip("/")
        # Bilinmeyen API yollari ASLA index.html'e dusmez; JSON 404 doner.
        if relative == "api" or relative.startswith("api/"):
            return JSONResponse(
                {"code": "not_found", "message": "Kaynak bulunamadi."}, status_code=404
            )
        if dist is None:
            return HTMLResponse(_PLACEHOLDER, status_code=200, headers={"Cache-Control": NO_CACHE})

        if relative:
            candidate = (dist / relative).resolve()
            # Path traversal korumasi: cikti dizininin disina cikilamaz.
            if dist.resolve() in candidate.parents or candidate == dist.resolve():
                if candidate.is_file():
                    media = mimetypes.guess_type(candidate.name)[0]
                    if candidate.suffix == ".webmanifest":
                        media = "application/manifest+json"
                    return FileResponse(
                        candidate,
                        media_type=media,
                        headers=_cache_headers(candidate.name, candidate),
                    )
                if candidate.is_dir():
                    index = candidate / "index.html"
                    if index.is_file():
                        return FileResponse(
                            index, media_type="text/html", headers={"Cache-Control": NO_CACHE}
                        )
                html = candidate.with_suffix(".html")
                if html.is_file():
                    return FileResponse(
                        html, media_type="text/html", headers={"Cache-Control": NO_CACHE}
                    )

        index = dist / "index.html"
        if index.is_file():
            return FileResponse(
                index, media_type="text/html", headers={"Cache-Control": NO_CACHE}
            )
        return HTMLResponse(_PLACEHOLDER, status_code=200, headers={"Cache-Control": NO_CACHE})

    return router
