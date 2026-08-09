"""FastAPI uygulama fabrikasi."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .api.router import api_router
from .api.spa import build_spa_router, find_web_dist
from .core.errors import ReceiverError
from .core.logging_setup import get_logger, setup_logging
from .core.ratelimit import RateLimitError
from .core.state import ReceiverState
from .security.paths import UnsafePathError
from .security.tokens import AuthError

log = get_logger("api")


def create_app(
    state: ReceiverState,
    *,
    configure_logging: bool = True,
    web_dist: str | Path | None = None,
) -> FastAPI:
    if configure_logging:
        setup_logging(state.config.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        await state.startup()
        yield
        await state.shutdown()

    app = FastAPI(
        title="PhoneShare Receiver",
        version=__version__,
        lifespan=lifespan,
        contact={
            "name": "Umut Celik (palamut62)",
            "url": "https://github.com/palamut62",
        },
    )
    app.state.receiver = state

    # Tauri'nin paketlenmis arayuzu receiver'a loopback HTTP uzerinden ulasir.
    # Yalnizca masaustu WebView originlerine izin ver; agdaki web istemcileri
    # zaten receiver ile ayni origin'den servis edilir.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", "null"],
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # --- hata donusturucular (PRD §71: teknik detay sizmaz) ---

    @app.exception_handler(ReceiverError)
    async def _receiver_error(request: Request, exc: ReceiverError) -> JSONResponse:
        if exc.detail:
            log.warning(
                "istek reddedildi",
                extra={"category": "error", "code": exc.code, "detail": exc.detail},
            )
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )

    @app.exception_handler(AuthError)
    async def _auth_error(request: Request, exc: AuthError) -> JSONResponse:
        return JSONResponse(status_code=401, content={"code": "unauthorized", "message": exc.message})

    @app.exception_handler(UnsafePathError)
    async def _unsafe_path(request: Request, exc: UnsafePathError) -> JSONResponse:
        log.warning("guvensiz yol reddedildi", extra={"category": "error", "detail": str(exc)})
        return JSONResponse(
            status_code=400,
            content={"code": "unsafe_path", "message": "Secilen klasor kullanilamaz."},
        )

    @app.exception_handler(RateLimitError)
    async def _rate_limit(request: Request, exc: RateLimitError) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"code": "rate_limited", "message": "Cok fazla istek gonderildi."},
            headers={"Retry-After": str(exc.retry_after)},
        )

    # --- yonlendiriciler: /api ONCE, SPA fallback EN SON ---
    app.include_router(api_router)
    dist = find_web_dist(str(web_dist) if web_dist else None)
    app.include_router(build_spa_router(dist))
    return app
