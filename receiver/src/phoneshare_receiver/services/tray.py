"""Windows tray ikonu: Ac / Duraklat / Klasoru ac / Cikis.

pystray + Pillow kurulu degilse tray sessizce devre disi kalir, servis calismaya devam eder.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import webbrowser
from typing import Any

from ..core.logging_setup import get_logger

log = get_logger("system")


def _open_folder(path: str) -> None:
    try:
        if os.name == "nt":
            os.startfile(path)  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.run(["open", path], check=False)
        else:
            subprocess.run(["xdg-open", path], check=False)
    except OSError as exc:
        log.warning("Klasor acilamadi", extra={"category": "system", "error": str(exc)})


def _icon_image() -> Any:
    from PIL import Image, ImageDraw

    size = 64
    image = Image.new("RGBA", (size, size), (17, 24, 39, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((10, 8, 54, 56), radius=10, outline=(56, 189, 248, 255), width=4)
    draw.polygon([(32, 18), (44, 34), (36, 34), (36, 46), (28, 46), (28, 34), (20, 34)],
                 fill=(56, 189, 248, 255))
    return image


def start_tray(state: Any, on_quit: Any) -> threading.Thread | None:
    """Tray'i ayri bir thread'te baslatir; basarisizsa None doner."""
    try:
        import pystray
    except ImportError:
        log.info("pystray yok; tray ikonu devre disi", extra={"category": "system"})
        return None

    def toggle_pause(icon: Any, item: Any) -> None:
        state.paused = not state.paused
        icon.title = f"PhoneShare Agent ({'duraklatildi' if state.paused else 'aktif'})"

    def open_panel(icon: Any, item: Any) -> None:
        webbrowser.open(state.config.control_plane_url)

    def open_target(icon: Any, item: Any) -> None:
        roots = state.config.allowed_roots
        if roots:
            _open_folder(roots[0])

    def quit_agent(icon: Any, item: Any) -> None:
        icon.stop()
        on_quit()

    menu = pystray.Menu(
        pystray.MenuItem("Ac (panel)", open_panel, default=True),
        pystray.MenuItem(
            "Duraklat",
            toggle_pause,
            checked=lambda item: state.paused,
        ),
        pystray.MenuItem("Klasoru ac", open_target),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Cikis", quit_agent),
    )

    try:
        icon = pystray.Icon("phoneshare", _icon_image(), "PhoneShare Agent (aktif)", menu)
    except Exception as exc:
        log.warning("Tray ikonu olusturulamadi", extra={"category": "system", "error": str(exc)})
        return None

    thread = threading.Thread(target=icon.run, name="phoneshare-tray", daemon=True)
    thread.start()
    return thread
