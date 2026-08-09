"""Tum `/api/*` uclarini birlestiren yonlendirici (PRD §57)."""

from __future__ import annotations

from fastapi import APIRouter

from .routes import devices, health, pair, rules, settings, stats, targets, transfers, uploads, ws

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(pair.router)
api_router.include_router(devices.router)
api_router.include_router(targets.router)
api_router.include_router(rules.router)
api_router.include_router(uploads.router)
api_router.include_router(transfers.router)
api_router.include_router(stats.router)
api_router.include_router(settings.router)
api_router.include_router(ws.router)

__all__ = ["api_router"]
