"""Belge turu tahmini (PRD §14).

Iki saglayici:
  * `heuristic` (VARSAYILAN) — anahtar kelime + uzanti tabanli, hicbir bagimliligi yok,
    hicbir veri disari cikmaz. Her zaman bir sonuc uretir.
  * `llm` — YEREL Ollama (varsayilan model `gemma3`) veya OpenAI *uyumlu* bir endpoint.
    Yalnizca kullanici acikca secerse calisir; timeout/hata durumunda heuristic'e duser.

Sonuc kural motoruna `tags` olarak beslenir; boylece `matchType='tag'` kurallari
"IMG_1838.jpg icinde 'DSI Hakedis' geciyorsa Hakedis klasorune" senaryosunu karsilar.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from ...core.logging_setup import get_logger
from ...core.normalize import normalize_text

log = get_logger("system")

#: PRD §14 kategori kumesi.
CATEGORIES: tuple[str, ...] = (
    "hakedis",
    "sozlesme",
    "proje",
    "resim",
    "video",
    "teknik_cizim",
    "diger",
)

CATEGORY_LABELS: dict[str, str] = {
    "hakedis": "Hakedis",
    "sozlesme": "Sozlesme",
    "proje": "Proje",
    "resim": "Resim",
    "video": "Video",
    "teknik_cizim": "Teknik Cizim",
    "diger": "Diger",
}

#: Anahtar kelimeler `normalize_text` ile ASCII'ye indirgenmis halde tutulur.
KEYWORDS: dict[str, tuple[str, ...]] = {
    "hakedis": (
        "hakedis", "hak edis", "yesil defter", "metraj", "imalat miktari",
        "ara hakedis", "kesin hakedis", "odeme emri", "isin adi",
    ),
    "sozlesme": (
        "sozlesme", "mukavele", "protokol", "taahhutname", "ihale",
        "teklif mektubu", "sartname", "contract",
    ),
    "proje": (
        "proje", "avan proje", "uygulama projesi", "vaziyet plani", "imar",
        "ruhsat", "project",
    ),
    "teknik_cizim": (
        "teknik cizim", "detay cizim", "kesit", "gorunus", "plan pafta",
        "pafta", "olcek 1/", "autocad", "drawing",
    ),
}

EXTENSION_CATEGORIES: dict[str, str] = {
    # resim
    "jpg": "resim", "jpeg": "resim", "png": "resim", "gif": "resim",
    "bmp": "resim", "webp": "resim", "heic": "resim", "tif": "resim", "tiff": "resim",
    # video
    "mp4": "video", "mov": "video", "avi": "video", "mkv": "video",
    "webm": "video", "m4v": "video", "hevc": "video",
    # teknik cizim
    "dwg": "teknik_cizim", "dxf": "teknik_cizim", "rvt": "teknik_cizim",
    "ifc": "teknik_cizim", "skp": "teknik_cizim",
}


@dataclass(frozen=True, slots=True)
class Classification:
    category: str
    confidence: float
    tags: tuple[str, ...] = field(default_factory=tuple)
    extracted_text: str | None = None
    #: "heuristic" | "llm" | "llm-fallback"
    provider: str = "heuristic"

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "label": CATEGORY_LABELS.get(self.category, self.category),
            "confidence": round(self.confidence, 3),
            "tags": list(self.tags),
            "provider": self.provider,
            **({"extractedText": self.extracted_text} if self.extracted_text else {}),
        }


# ---------------------------------------------------------------------- #
# Heuristic                                                               #
# ---------------------------------------------------------------------- #


def _extension_of(file_name: str) -> str:
    _, _, ext = file_name.rpartition(".")
    return ext.lower() if ext and ext != file_name else ""


def classify_heuristic(
    file_name: str,
    mime_type: str | None = None,
    text: str | None = None,
) -> Classification:
    """Anahtar kelime + uzanti tabanli tahmin. Hicbir bagimliligi yoktur."""
    haystack_name = normalize_text(file_name)
    haystack_text = normalize_text(text) if text else ""

    scores: dict[str, float] = {}
    hits: dict[str, list[str]] = {}
    for category, keywords in KEYWORDS.items():
        for keyword in keywords:
            needle = normalize_text(keyword)
            if not needle:
                continue
            if needle in haystack_name:
                # Dosya adindaki eslesme icerikten daha guclu bir sinyaldir.
                scores[category] = scores.get(category, 0.0) + 2.0
                hits.setdefault(category, []).append(keyword)
            elif needle in haystack_text:
                scores[category] = scores.get(category, 0.0) + 1.0
                hits.setdefault(category, []).append(keyword)

    ext = _extension_of(file_name)
    ext_category = EXTENSION_CATEGORIES.get(ext)
    if ext_category is None and mime_type:
        if mime_type.startswith("image/"):
            ext_category = "resim"
        elif mime_type.startswith("video/"):
            ext_category = "video"

    if scores:
        # Icerik/ad sinyali uzantidan daha belirleyicidir (IMG_1838.jpg -> Hakedis).
        best = max(sorted(scores), key=lambda c: scores[c])
        confidence = min(0.95, 0.5 + 0.15 * scores[best])
        tags = _build_tags(best, hits.get(best, ()), ext_category)
        return Classification(best, confidence, tags, provider="heuristic")

    if ext_category:
        return Classification(
            ext_category, 0.6, _build_tags(ext_category, (), None), provider="heuristic"
        )

    return Classification("diger", 0.2, ("diger",), provider="heuristic")


def _build_tags(
    category: str, matched: tuple[str, ...] | list[str], media_category: str | None
) -> tuple[str, ...]:
    """Kural motorunun `matchType='tag'` ile kullanacagi etiket kumesi."""
    tags: list[str] = [category, CATEGORY_LABELS.get(category, category)]
    if media_category and media_category != category:
        tags.append(media_category)
    tags.extend(str(m) for m in matched)
    seen: set[str] = set()
    out: list[str] = []
    for tag in tags:
        key = normalize_text(tag)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(tag)
    return tuple(out)


# ---------------------------------------------------------------------- #
# LLM (opsiyonel, kullanici acikca acmadikca calismaz)                    #
# ---------------------------------------------------------------------- #

_PROMPT = (
    "Asagidaki dosyanin turunu belirle. Yalnizca JSON dondur:\n"
    '{"category": "<kategori>", "confidence": <0-1>, "tags": ["..."]}\n'
    f"Gecerli kategoriler: {', '.join(CATEGORIES)}\n"
)


class LlmClassifier:
    """Ollama veya OpenAI uyumlu endpoint uzerinden siniflandirma."""

    def __init__(
        self,
        base_url: str = "http://127.0.0.1:11434",
        model: str = "gemma3",
        api: str = "ollama",
        timeout_sec: float = 30.0,
        api_key: str | None = None,
        send_text: bool = False,
        max_text_chars: int = 4000,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api = api
        self.timeout_sec = timeout_sec
        self.api_key = api_key
        self.send_text = send_text
        self.max_text_chars = max_text_chars

    async def classify(
        self, file_name: str, mime_type: str | None = None, text: str | None = None
    ) -> Classification | None:
        """Basarisizsa `None` doner; cagiran taraf heuristic'e duser."""
        import httpx

        user = f"Dosya adi: {file_name}\nMIME: {mime_type or 'bilinmiyor'}\n"
        if self.send_text and text:
            user += f"Icerik (kismi):\n{text[: self.max_text_chars]}\n"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                if self.api == "ollama":
                    response = await client.post(
                        f"{self.base_url}/api/chat",
                        json={
                            "model": self.model,
                            "stream": False,
                            "format": "json",
                            "messages": [
                                {"role": "system", "content": _PROMPT},
                                {"role": "user", "content": user},
                            ],
                        },
                    )
                    response.raise_for_status()
                    content = (response.json().get("message") or {}).get("content") or ""
                else:
                    headers = {"authorization": f"Bearer {self.api_key}"} if self.api_key else {}
                    response = await client.post(
                        f"{self.base_url}/v1/chat/completions",
                        headers=headers,
                        json={
                            "model": self.model,
                            "response_format": {"type": "json_object"},
                            "messages": [
                                {"role": "system", "content": _PROMPT},
                                {"role": "user", "content": user},
                            ],
                        },
                    )
                    response.raise_for_status()
                    choices = response.json().get("choices") or []
                    content = ((choices[0] if choices else {}).get("message") or {}).get(
                        "content"
                    ) or ""
        except Exception as exc:
            log.debug("LLM siniflandirma basarisiz", extra={"category": "system", "error": str(exc)})
            return None

        return _parse_llm_json(content)


def _parse_llm_json(content: str) -> Classification | None:
    raw = (content or "").strip()
    # Bazi modeller ```json ... ``` sarmalayicisi ekler.
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{") :] if "{" in raw else raw
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    category = str(data.get("category") or "").strip().lower()
    if category not in CATEGORIES:
        return None
    try:
        confidence = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        confidence = 0.5
    confidence = max(0.0, min(1.0, confidence))
    raw_tags = data.get("tags")
    tags = tuple(str(t) for t in raw_tags if str(t).strip()) if isinstance(raw_tags, list) else ()
    return Classification(
        category, confidence, _build_tags(category, tags, None), provider="llm"
    )


# ---------------------------------------------------------------------- #
# Genel API                                                               #
# ---------------------------------------------------------------------- #


class Classifier:
    """Yapilandirilmis saglayiciyi uygular; LLM basarisizsa heuristic'e duser."""

    def __init__(self, provider: str = "heuristic", llm: LlmClassifier | None = None) -> None:
        self.provider = provider if provider in ("heuristic", "llm") else "heuristic"
        self.llm = llm

    async def classify(
        self,
        file_name: str,
        mime_type: str | None = None,
        text: str | None = None,
    ) -> Classification:
        if self.provider == "llm" and self.llm is not None:
            result = await self.llm.classify(file_name, mime_type, text)
            if result is not None:
                return Classification(
                    result.category,
                    result.confidence,
                    result.tags,
                    extracted_text=text,
                    provider="llm",
                )
            log.info(
                "LLM siniflandirma kullanilamadi; heuristic'e dusuldu",
                extra={"category": "system"},
            )
            fallback = classify_heuristic(file_name, mime_type, text)
            return Classification(
                fallback.category,
                fallback.confidence,
                fallback.tags,
                extracted_text=text,
                provider="llm-fallback",
            )

        result = classify_heuristic(file_name, mime_type, text)
        return Classification(
            result.category, result.confidence, result.tags, extracted_text=text
        )
