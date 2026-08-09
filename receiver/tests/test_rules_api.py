"""PRD §33/§34 — /api/rules CRUD endpoint testleri.

Kural motoru davranisi `test_rules_parity.py`'de (services.rules vs rules.test.ts)
ayri ayri dogrulanir; burada yalnizca yonetim API'si (CRUD + validasyon) test edilir.
"""

from __future__ import annotations


def _create_rule(client, *, target_id: str, **overrides) -> dict:
    payload: dict = {
        "name": "PDF'ler",
        "match_type": "extension",
        "match_value": "pdf",
        "target_id": target_id,
        "conflict_policy": "rename",
    }
    payload.update(overrides)
    response = client.post("/api/rules", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


class TestRules:
    def test_authsiz_401(self, lan_client) -> None:
        assert lan_client.get("/api/rules").status_code == 401
        assert lan_client.post("/api/rules", json={}).status_code == 401

    def test_bos_liste(self, client, paired) -> None:
        assert client.get("/api/rules").json() == []

    def test_create_yanit_alanlari(self, client, paired, belgeler) -> None:
        body = _create_rule(client, target_id=belgeler)
        assert body["name"] == "PDF'ler"
        assert body["match_type"] == "extension"
        assert body["match_value"] == "pdf"
        assert body["target_id"] == belgeler
        assert body["target_name"] == "Belgeler"
        assert body["priority"] == 0
        assert body["enabled"] is True
        assert body["conflict_policy"] == "rename"
        assert body["rename"] is None
        assert body["id"]
        assert body["created_at"]

    def test_priority_otomatik_max_arti_1(self, client, paired, belgeler) -> None:
        _create_rule(client, target_id=belgeler, name="A", priority=5)
        _create_rule(client, target_id=belgeler, name="B", priority=3)
        auto = _create_rule(client, target_id=belgeler, name="C")
        assert auto["priority"] == 6

    def test_gecersiz_match_type_422(self, client, paired, belgeler) -> None:
        response = client.post(
            "/api/rules",
            json={
                "name": "Kotu",
                "match_type": "gizli",
                "match_value": "pdf",
                "target_id": belgeler,
            },
        )
        assert response.status_code == 422

    def test_olmayan_hedef_422(self, client, paired) -> None:
        response = client.post(
            "/api/rules",
            json={
                "name": "Kayip",
                "match_type": "extension",
                "match_value": "pdf",
                "target_id": "yok",
            },
        )
        assert response.status_code == 422
        assert "Hedef bulunamadi" in response.text

    def test_devre_dis_hedef_422(self, client, paired, belgeler) -> None:
        assert client.put(f"/api/targets/{belgeler}", json={"enabled": False}).status_code == 200
        response = client.post(
            "/api/rules",
            json={
                "name": "Kapali",
                "match_type": "extension",
                "match_value": "pdf",
                "target_id": belgeler,
            },
        )
        assert response.status_code == 422

    def test_bilinmeyen_alan_422(self, client, paired, belgeler) -> None:
        response = client.post(
            "/api/rules",
            json={
                "name": "Gizli",
                "match_type": "extension",
                "match_value": "pdf",
                "target_id": belgeler,
                "gizli": True,
            },
        )
        assert response.status_code == 422

    def test_siralama_priority_asc(self, client, paired, belgeler) -> None:
        for name, priority in (("Bir", 5), ("Iki", 1), ("Uc", 3)):
            _create_rule(client, target_id=belgeler, name=name, priority=priority)
        listing = client.get("/api/rules").json()
        assert [entry["priority"] for entry in listing] == [1, 3, 5]
        assert [entry["name"] for entry in listing] == ["Iki", "Uc", "Bir"]

    def test_update_rename_enabled_priority(self, client, paired, belgeler) -> None:
        created = _create_rule(client, target_id=belgeler)
        rule_id = created["id"]

        updated = client.put(
            f"/api/rules/{rule_id}",
            json={"rename": "tarih_{orig}.{ext}", "enabled": False, "priority": 9},
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert body["rename"] == "tarih_{orig}.{ext}"
        assert body["enabled"] is False
        assert body["priority"] == 9

        # Kismi guncelleme: diger alanlar korunur.
        partial = client.put(f"/api/rules/{rule_id}", json={"match_value": "PDF"})
        assert partial.status_code == 200, partial.text
        assert partial.json()["match_value"] == "PDF"
        assert partial.json()["name"] == "PDF'ler"

    def test_update_hedef_degisimi(self, client, paired, belgeler, target_root) -> None:
        created = _create_rule(client, target_id=belgeler)
        fotolar = client.post(
            "/api/targets",
            json={"name": "Fotograflar", "path": str(target_root / "Fotograflar")},
        )
        assert fotolar.status_code == 201, fotolar.text
        fotolar_id = fotolar.json()["id"]

        changed = client.put(f"/api/rules/{created['id']}", json={"target_id": fotolar_id})
        assert changed.status_code == 200, changed.text
        assert changed.json()["target_id"] == fotolar_id
        assert changed.json()["target_name"] == "Fotograflar"

        # Olmayan hedefe gecis reddedilir; mevcut hedef korunur.
        bad = client.put(f"/api/rules/{created['id']}", json={"target_id": "yok"})
        assert bad.status_code == 422

    def test_delete_204_sonra_404(self, client, paired, belgeler) -> None:
        created = _create_rule(client, target_id=belgeler)
        rule_id = created["id"]
        assert client.delete(f"/api/rules/{rule_id}").status_code == 204
        assert all(entry["id"] != rule_id for entry in client.get("/api/rules").json())
        assert client.delete(f"/api/rules/{rule_id}").status_code == 404
        assert client.put(f"/api/rules/{rule_id}", json={"name": "X"}).status_code == 404

    def test_hedef_silinince_target_name_null(self, client, paired, belgeler) -> None:
        created = _create_rule(client, target_id=belgeler)
        assert created["target_name"] == "Belgeler"
        assert client.delete(f"/api/targets/{belgeler}").status_code == 204
        entry = next(r for r in client.get("/api/rules").json() if r["id"] == created["id"])
        assert entry["target_name"] is None
