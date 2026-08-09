"""Akilli siniflandirma + OCR (PRD §13/§14/§15) — TAMAMEN OPSIYONEL.

`ai_enabled=false` (varsayilan) iken bu paketten hicbir kod calismaz; sistem
Faz 2 davranisiyla birebir ayni kalir ve hicbir veri disari cikmaz.

Pipeline transferi BLOKLAMAZ: dosya once diske yazilir, siniflandirma sonra
(arka planda, timeout ile) calisir ve gerekirse dosyayi dogru klasore tasir.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ...core.config import AgentConfig
from ...core.logging_setup import get_logger
from .classify import (
    CATEGORIES,
    CATEGORY_LABELS,
    Classification,
    Classifier,
    LlmClassifier,
    classify_heuristic,
)
from .ocr import OcrEngine, OcrResult, available_providers

log = get_logger("system")

__all__ = [
    "CATEGORIES",
    "CATEGORY_LABELS",
    "AiPipeline",
    "AnalysisResult",
    "Classification",
    "Classifier",
    "LlmClassifier",
    "OcrEngine",
    "OcrResult",
    "available_providers",
    "build_pipeline",
    "classify_heuristic",
]


@dataclass(frozen=True, slots=True)
class AnalysisResult:
    classification: Classification
    ocr_provider: str | None = None

    @property
    def tags(self) -> tuple[str, ...]:
        return self.classification.tags

    def to_dict(self) -> dict:
        payload = self.classification.to_dict()
        if self.ocr_provider:
            payload["ocrProvider"] = self.ocr_provider
        return payload


class AiPipeline:
    """OCR + siniflandirmayi bir arada calistirir. Hata durumunda `None` doner."""

    def __init__(
        self,
        enabled: bool = False,
        ocr: OcrEngine | None = None,
        classifier: Classifier | None = None,
        ocr_enabled: bool = True,
    ) -> None:
        self.enabled = enabled
        self.ocr = ocr
        self.ocr_enabled = ocr_enabled
        self.classifier = classifier or Classifier()

    async def analyze(
        self,
        path: Path,
        file_name: str | None = None,
        mime_type: str | None = None,
    ) -> AnalysisResult | None:
        if not self.enabled:
            return None

        name = file_name or path.name
        text: str | None = None
        ocr_provider: str | None = None

        if self.ocr_enabled and self.ocr is not None:
            result = await self.ocr.extract(path)
            if result is not None and result.text:
                text = result.text
                ocr_provider = result.provider

        try:
            classification = await self.classifier.classify(name, mime_type, text)
        except Exception as exc:  # siniflandirma asla transferi etkilememeli
            log.warning(
                "Siniflandirma basarisiz", extra={"category": "system", "error": str(exc)}
            )
            return None

        return AnalysisResult(classification=classification, ocr_provider=ocr_provider)

    def close(self) -> None:
        if self.ocr is not None:
            self.ocr.close()


def build_pipeline(config: AgentConfig, llm_api_key: str | None = None) -> AiPipeline:
    """Yapilandirmadan pipeline kurar. Kapaliysa hicbir bagimlilik yuklenmez."""
    if not config.ai_enabled:
        return AiPipeline(enabled=False)

    ocr = None
    if config.ai_ocr_enabled and config.ai_ocr_provider != "none":
        ocr = OcrEngine(
            provider=config.ai_ocr_provider,
            max_bytes=config.ai_ocr_max_bytes,
            timeout_sec=config.ai_ocr_timeout_sec,
            max_chars=config.ai_text_max_chars,
        )
        if ocr.resolved_provider() is None:
            log.info(
                "OCR saglayicisi bulunamadi; OCR devre disi (siniflandirma dosya adiyla surer). "
                'Kurulum: pip install -e ".[ocr]"',
                extra={"category": "system"},
            )

    llm = None
    if config.ai_classify_provider == "llm":
        llm = LlmClassifier(
            base_url=config.ai_llm_base_url,
            model=config.ai_llm_model,
            api=config.ai_llm_api,
            timeout_sec=config.ai_llm_timeout_sec,
            api_key=llm_api_key,
            send_text=config.ai_llm_send_text,
        )

    return AiPipeline(
        enabled=True,
        ocr=ocr,
        ocr_enabled=config.ai_ocr_enabled,
        classifier=Classifier(provider=config.ai_classify_provider, llm=llm),
    )
