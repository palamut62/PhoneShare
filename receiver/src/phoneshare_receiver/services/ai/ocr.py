"""OCR: gorsellerden ve taranmis PDF'lerden metin cikarma (OPSIYONEL).

Tasarim ilkeleri:
- Tum bagimliliklar OPSIYONELDIR (`pip install -e ".[ocr]"`). Kurulu degilse ozellik
  kendini sessizce devre disi birakir; ASLA hata firlatmaz.
- Metin katmani olan PDF'lerde once `pypdf` denenir (ucuz yol); yeterli metin varsa
  OCR hic calistirilmaz.
- OCR senkron ve CPU-yogun oldugu icin ayri bir thread pool'da, timeout ile calisir.
  Cagiran taraf (upload pipeline) BLOKLANMAZ.
- Hicbir veri disari cikmaz: tum saglayicilar yereldir.
"""

from __future__ import annotations

import asyncio
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

from ...core.logging_setup import get_logger

log = get_logger("system")

IMAGE_SUFFIXES = frozenset(
    {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp", ".gif"}
)
PDF_SUFFIXES = frozenset({".pdf"})

#: Metin katmanindan bu kadar karakter cikarsa PDF "metin PDF" sayilir ve OCR atlanir.
PDF_TEXT_LAYER_MIN_CHARS = 40


def _has_module(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def available_providers() -> list[str]:
    """Bu makinede gercekten kullanilabilir OCR saglayicilari."""
    out: list[str] = []
    if _has_module("pytesseract") and _has_module("PIL"):
        out.append("tesseract")
    if _has_module("paddleocr"):
        out.append("paddleocr")
    return out


def pdf_text_supported() -> bool:
    return _has_module("pypdf")


@dataclass(frozen=True, slots=True)
class OcrResult:
    text: str
    #: "pypdf" (metin katmani) | "tesseract" | "paddleocr"
    provider: str
    truncated: bool = False


class OcrUnavailable(Exception):
    """Hicbir saglayici kurulu degil — cagiran taraf sessizce devam etmelidir."""


class OcrEngine:
    """Yapilandirmaya gore metin cikarir. Kurulu saglayici yoksa `None` doner."""

    def __init__(
        self,
        provider: str = "auto",
        max_bytes: int = 20 * 1024 * 1024,
        timeout_sec: float = 20.0,
        max_chars: int = 20_000,
        languages: str = "tur+eng",
        executor: ThreadPoolExecutor | None = None,
    ) -> None:
        self.provider = provider
        self.max_bytes = max_bytes
        self.timeout_sec = timeout_sec
        self.max_chars = max_chars
        self.languages = languages
        # OCR'i ana event loop'tan ayirmak icin kucuk, ayri bir havuz.
        self._executor = executor or ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="phoneshare-ocr"
        )
        self._owns_executor = executor is None

    # ------------------------------------------------------------------ #

    def resolved_provider(self) -> str | None:
        """Fiilen kullanilacak OCR saglayicisi; yoksa None."""
        if self.provider == "none":
            return None
        found = available_providers()
        if self.provider == "auto":
            return found[0] if found else None
        return self.provider if self.provider in found else None

    def supports(self, path: Path) -> bool:
        suffix = path.suffix.lower()
        if suffix in PDF_SUFFIXES:
            return pdf_text_supported() or self.resolved_provider() is not None
        if suffix in IMAGE_SUFFIXES:
            return self.resolved_provider() is not None
        return False

    def close(self) -> None:
        if self._owns_executor:
            self._executor.shutdown(wait=False, cancel_futures=True)

    # ------------------------------------------------------------------ #

    async def extract(self, path: Path) -> OcrResult | None:
        """Metni cikarir. Desteklenmeyen/asiri buyuk/timeout durumunda `None`."""
        try:
            size = path.stat().st_size
        except OSError:
            return None
        if self.max_bytes and size > self.max_bytes:
            log.debug(
                "OCR atlandi: dosya boyut sinirinin ustunde",
                extra={"category": "system", "sizeBytes": size},
            )
            return None
        if not self.supports(path):
            return None

        loop = asyncio.get_running_loop()
        try:
            return await asyncio.wait_for(
                loop.run_in_executor(self._executor, self._extract_sync, path),
                timeout=self.timeout_sec,
            )
        except TimeoutError:
            log.warning(
                "OCR zaman asimina ugradi",
                extra={"category": "system", "file": path.name, "timeout": self.timeout_sec},
            )
            return None
        except Exception as exc:  # OCR asla cagirani dusurmemeli
            log.warning("OCR basarisiz", extra={"category": "system", "error": str(exc)})
            return None

    # ------------------------------------------------------------------ #
    # Senkron gerceklestirimler (thread pool icinde calisir)              #
    # ------------------------------------------------------------------ #

    def _extract_sync(self, path: Path) -> OcrResult | None:
        suffix = path.suffix.lower()
        if suffix in PDF_SUFFIXES:
            layer = self._pdf_text_layer(path)
            if layer and len(layer.strip()) >= PDF_TEXT_LAYER_MIN_CHARS:
                return self._finish(layer, "pypdf")
            # Taranmis PDF: sayfa->goruntu cevirimi icin pdf2image gerekir.
            rendered = self._pdf_first_page_image(path)
            if rendered is None:
                return self._finish(layer, "pypdf") if layer else None
            text = self._ocr_image_sync(rendered)
            return self._finish(text, self.resolved_provider() or "unknown") if text else None
        if suffix in IMAGE_SUFFIXES:
            text = self._ocr_image_sync(path)
            return self._finish(text, self.resolved_provider() or "unknown") if text else None
        return None

    def _finish(self, text: str, provider: str) -> OcrResult:
        cleaned = " ".join(text.split())
        truncated = len(cleaned) > self.max_chars
        return OcrResult(
            text=cleaned[: self.max_chars], provider=provider, truncated=truncated
        )

    def _pdf_text_layer(self, path: Path) -> str:
        if not pdf_text_supported():
            return ""
        try:
            from pypdf import PdfReader  # type: ignore[import-not-found]

            reader = PdfReader(str(path))
            chunks: list[str] = []
            total = 0
            # Ilk sayfalar siniflandirma icin yeterlidir; buyuk PDF'de bosuna okuma yapma.
            for page in reader.pages[:10]:
                piece = page.extract_text() or ""
                chunks.append(piece)
                total += len(piece)
                if total >= self.max_chars:
                    break
            return "\n".join(chunks)
        except Exception as exc:
            log.debug("PDF metin katmani okunamadi", extra={"category": "system", "error": str(exc)})
            return ""

    def _pdf_first_page_image(self, path: Path) -> Path | None:
        """Taranmis PDF'in ilk sayfasini gecici bir PNG'ye render eder (pdf2image varsa)."""
        if not _has_module("pdf2image"):
            return None
        try:
            import tempfile

            from pdf2image import convert_from_path  # type: ignore[import-not-found]

            images = convert_from_path(str(path), first_page=1, last_page=1, dpi=200)
            if not images:
                return None
            tmp = Path(tempfile.gettempdir()) / f"phoneshare-ocr-{path.stem}.png"
            images[0].save(tmp, "PNG")
            return tmp
        except Exception as exc:
            log.debug("PDF render edilemedi", extra={"category": "system", "error": str(exc)})
            return None

    def _ocr_image_sync(self, path: Path) -> str:
        provider = self.resolved_provider()
        if provider == "tesseract":
            return self._tesseract(path)
        if provider == "paddleocr":
            return self._paddle(path)
        return ""

    def _tesseract(self, path: Path) -> str:
        try:
            import pytesseract  # type: ignore[import-not-found]
            from PIL import Image  # type: ignore[import-not-found]

            with Image.open(path) as img:
                return pytesseract.image_to_string(img, lang=self.languages)
        except Exception as exc:
            # Tesseract binary'si kurulu degilse burasi calisir; sessizce devam.
            log.debug("tesseract kullanilamadi", extra={"category": "system", "error": str(exc)})
            return ""

    def _paddle(self, path: Path) -> str:
        try:
            from paddleocr import PaddleOCR  # type: ignore[import-not-found]

            if not hasattr(self, "_paddle_engine"):
                self._paddle_engine = PaddleOCR(use_angle_cls=True, lang="tr", show_log=False)
            result = self._paddle_engine.ocr(str(path), cls=True)
            lines: list[str] = []
            for page in result or []:
                for entry in page or []:
                    # [box, (text, confidence)]
                    if len(entry) >= 2 and entry[1]:
                        lines.append(str(entry[1][0]))
            return "\n".join(lines)
        except Exception as exc:
            log.debug("paddleocr kullanilamadi", extra={"category": "system", "error": str(exc)})
            return ""
