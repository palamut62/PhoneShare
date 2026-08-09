"""Kural motoru paritesi: `packages/shared-types/src/rules.test.ts` ile ayni vakalar.

Python (receiver) ve TypeScript (PWA onizlemesi) ayni girdi icin AYNI sonucu uretmelidir.
"""

from __future__ import annotations

import pytest

from phoneshare_receiver.core.normalize import normalize_text, parse_size
from phoneshare_receiver.services.rules import (
    FileMeta,
    Folder,
    Rule,
    apply_rename_template,
    match_rule,
    resolve_target,
)

FOLDERS = [
    Folder(id="f-root", name="DSI", path=r"D:\DSI", parent_id=None, is_default=True),
    Folder(id="f-doc", name="Belgeler", path=r"D:\DSI\Belgeler", parent_id="f-root"),
    Folder(id="f-img", name="Resimler", path=r"D:\DSI\Resimler", parent_id="f-root"),
    Folder(id="f-big", name="Buyuk", path=r"D:\DSI\Buyuk", parent_id="f-root"),
]

_UNSET = object()


def rule(match_type: str, match_value: str, **kwargs) -> Rule:
    return Rule(
        id=kwargs.get("id", "r-1"),
        name=kwargs.get("name", "kural"),
        priority=kwargs.get("priority", 100),
        enabled=kwargs.get("enabled", True),
        match_type=match_type,  # type: ignore[arg-type]
        match_value=match_value,
        target_folder_id=kwargs.get("target_folder_id", "f-doc"),
        rename=kwargs.get("rename"),
        conflict_policy=kwargs.get("conflict_policy", "rename"),
    )


def file(**kwargs) -> FileMeta:
    source = kwargs.get("source_app", _UNSET)
    created = kwargs.get("created_at", _UNSET)
    return FileMeta(
        file_name=kwargs.get("file_name", "rapor.pdf"),
        size_bytes=kwargs.get("size_bytes", 1024),
        source_app="WhatsApp" if source is _UNSET else source,
        mime_type=kwargs.get("mime_type", "application/pdf"),
        created_at="2024-05-03T10:00:00.000Z" if created is _UNSET else created,
        tags=tuple(kwargs.get("tags", ())),
    )


class TestExtension:
    def test_glob_pdf(self) -> None:
        assert match_rule(file(file_name="Fatura.PDF"), rule("extension", "*.pdf"))

    def test_glob_pdf_jpg_eslesmez(self) -> None:
        assert not match_rule(file(file_name="foto.jpg"), rule("extension", "*.pdf"))

    def test_virgullu_liste_or(self) -> None:
        r = rule("extension", "pdf, docx, xlsx")
        assert match_rule(file(file_name="sunum.docx"), r)
        assert not match_rule(file(file_name="video.mp4"), r)

    def test_uzantisiz_dosya(self) -> None:
        assert not match_rule(file(file_name="LICENSE"), rule("extension", "pdf"))

    def test_ad_uzanti_glob(self) -> None:
        r = rule("extension", "rapor*.xlsx")
        assert match_rule(file(file_name="rapor-2024.xlsx"), r)
        assert not match_rule(file(file_name="butce-2024.xlsx"), r)


class TestFilename:
    def test_buyuk_kucuk_duyarsiz(self) -> None:
        assert match_rule(file(file_name="AYLIK_Fatura_05.pdf"), rule("filename", "fatura"))

    def test_turkce_normalize(self) -> None:
        assert not match_rule(
            file(file_name="ŞUBAT_Ödeme_Fişi.pdf"), rule("filename", "subat odeme")
        )
        assert match_rule(file(file_name="ŞUBAT_Ödeme.pdf"), rule("filename", "odeme"))
        assert match_rule(file(file_name="Iğdır-rapor.pdf"), rule("filename", "igdir"))

    def test_eslesmeyen(self) -> None:
        assert not match_rule(file(file_name="rapor.pdf"), rule("filename", "makbuz"))


class TestSourceTag:
    def test_kaynak_kismi_eslesme(self) -> None:
        assert match_rule(file(source_app="WhatsApp Business"), rule("source", "whatsapp"))

    def test_kaynak_yok(self) -> None:
        assert not match_rule(file(source_app=None), rule("source", "whatsapp"))

    def test_etiket(self) -> None:
        assert match_rule(file(tags=["Muhasebe", "Önemli"]), rule("tag", "onemli"))
        assert not match_rule(file(tags=["Muhasebe"]), rule("tag", "arsiv"))


class TestSize:
    def test_buyuktur(self) -> None:
        r = rule("size", "> 10MB")
        assert match_rule(file(size_bytes=20 * 1024 * 1024), r)
        assert not match_rule(file(size_bytes=5 * 1024 * 1024), r)

    def test_kucuktur(self) -> None:
        r = rule("size", "< 500KB")
        assert match_rule(file(size_bytes=100 * 1024), r)
        assert not match_rule(file(size_bytes=900 * 1024), r)

    def test_aralik(self) -> None:
        r = rule("size", "10MB-20MB")
        assert match_rule(file(size_bytes=15 * 1024 * 1024), r)
        assert not match_rule(file(size_bytes=25 * 1024 * 1024), r)

    def test_gecersiz_ifade(self) -> None:
        assert not match_rule(file(size_bytes=999), rule("size", "> cok"))

    def test_parse_size(self) -> None:
        assert parse_size("1KB") == 1024
        assert parse_size("1.5MB") == round(1.5 * 1024 * 1024)
        assert parse_size("512") == 512
        assert parse_size("abc") is None


class TestDate:
    def test_aralik(self) -> None:
        r = rule("date", "2024-05-01..2024-05-31")
        assert match_rule(file(created_at="2024-05-03T10:00:00Z"), r)
        assert not match_rule(file(created_at="2024-06-03T10:00:00Z"), r)

    def test_bitis_gunu_dahil(self) -> None:
        r = rule("date", "2024-05-01..2024-05-03")
        assert match_rule(file(created_at="2024-05-03T23:59:00Z"), r)

    def test_buyuk_esit(self) -> None:
        r = rule("date", ">= 2024-05-01")
        assert match_rule(file(created_at="2024-07-01T00:00:00Z"), r)
        assert not match_rule(file(created_at="2024-01-01T00:00:00Z"), r)

    def test_tarih_yok(self) -> None:
        assert not match_rule(file(created_at=None), rule("date", "2024-05-03"))


class TestGenel:
    def test_devre_disi_kural(self) -> None:
        assert not match_rule(
            file(file_name="a.pdf"), rule("extension", "pdf", enabled=False)
        )

    def test_bos_match_value(self) -> None:
        assert not match_rule(file(), rule("filename", "   "))


class TestRenameTemplate:
    def test_tum_placeholderlar(self) -> None:
        out = apply_rename_template(
            "{date}_{source}_{orig}_{seq}.{ext}",
            file(file_name="fatura.pdf", source_app="WhatsApp"),
            seq=7,
        )
        assert out == "2024-05-03_whatsapp_fatura_007.pdf"

    def test_ext_yoksa_orijinal_uzanti_korunur(self) -> None:
        assert apply_rename_template("{date}-{orig}", file(file_name="not.txt")) == (
            "2024-05-03-not.txt"
        )

    def test_gecersiz_karakterler_temizlenir(self) -> None:
        assert apply_rename_template("a/b:c{orig}", file(file_name="x.pdf")) == "a_b_cx.pdf"

    def test_kaynak_yoksa_unknown(self) -> None:
        assert apply_rename_template(
            "{source}-{orig}.{ext}", file(file_name="a.png", source_app=None)
        ) == "unknown-a.png"


class TestResolveTarget:
    RULES = [
        rule("extension", "jpg, png", id="r-img", priority=10, target_folder_id="f-img"),
        rule(
            "size",
            "> 100MB",
            id="r-big",
            priority=20,
            target_folder_id="f-big",
            conflict_policy="version",
        ),
        rule(
            "extension",
            "pdf",
            id="r-pdf",
            priority=30,
            target_folder_id="f-doc",
            rename="{date}_{orig}.{ext}",
        ),
    ]

    def test_oncelik_ilk_eslesen(self) -> None:
        res = resolve_target(
            file(file_name="tatil.jpg", size_bytes=200 * 1024 * 1024), self.RULES, FOLDERS
        )
        assert res.matched_rule_id == "r-img"
        assert res.folder_id == "f-img"

    def test_rename_sablonu(self) -> None:
        res = resolve_target(file(file_name="fatura.pdf"), self.RULES, FOLDERS)
        assert res.matched_rule_id == "r-pdf"
        assert res.file_name == "2024-05-03_fatura.pdf"
        assert res.folder_id == "f-doc"

    def test_conflict_policy_tasinir(self) -> None:
        res = resolve_target(
            file(file_name="yedek.zip", size_bytes=300 * 1024 * 1024), self.RULES, FOLDERS
        )
        assert res.matched_rule_id == "r-big"
        assert res.conflict_policy == "version"

    def test_varsayilana_duser(self) -> None:
        res = resolve_target(file(file_name="notlar.md", size_bytes=10), self.RULES, FOLDERS)
        assert res.matched_rule_id is None
        assert res.folder_id == "f-root"
        assert res.file_name == "notlar.md"

    def test_default_folder_id_ezer(self) -> None:
        res = resolve_target(
            file(file_name="notlar.md"), self.RULES, FOLDERS, default_folder_id="f-doc"
        )
        assert res.folder_id == "f-doc"

    def test_devre_disi_kural_atlanir(self) -> None:
        disabled = [
            rule(
                "extension",
                "jpg, png",
                id="r-img",
                priority=10,
                target_folder_id="f-img",
                enabled=False,
            ),
            *self.RULES[1:],
        ]
        res = resolve_target(
            file(file_name="tatil.jpg", size_bytes=200 * 1024 * 1024), disabled, FOLDERS
        )
        assert res.matched_rule_id == "r-big"

    def test_silinmis_hedefli_kural_atlanir(self) -> None:
        orphan = [
            rule("extension", "pdf", id="r-orphan", priority=1, target_folder_id="f-yok"),
            *self.RULES,
        ]
        res = resolve_target(file(file_name="fatura.pdf"), orphan, FOLDERS)
        assert res.matched_rule_id == "r-pdf"

    def test_bos_kural_listesi(self) -> None:
        res = resolve_target(file(), [], FOLDERS)
        assert res.matched_rule_id is None
        assert res.folder_id == "f-root"


@pytest.mark.parametrize(
    ("raw", "expected"), [("İĞÜŞÖÇ ığüşöç", "igusoc igusoc"), ("Rapor", "rapor")]
)
def test_normalize_text(raw: str, expected: str) -> None:
    assert normalize_text(raw) == expected
