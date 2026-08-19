"""PRD §57-§60, §71, §93 — endpoint sozlesmesi, ayarlar, cihazlar ve PWA servisi."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


class TestHealth:
    def test_sozlesme(self, client) -> None:
        body = client.get("/api/health").json()
        assert body["status"] == "online"
        assert body["version"] == "1.0.0"
        assert body["owner"] == "Umut Celik (palamut62)"


class TestTargets:
    def test_crud(self, client, paired, target_root: Path) -> None:
        created = client.post(
            "/api/targets",
            json={"name": "Fotograflar", "path": str(target_root / "Fotograflar")},
        )
        assert created.status_code == 201
        target = created.json()
        assert target["enabled"] is True
        # PRD §93 — gercek Windows yolu istemciye sizmaz.
        assert "path" not in target

        listing = client.get("/api/targets").json()
        assert any(item["id"] == target["id"] for item in listing)

        updated = client.put(
            f"/api/targets/{target['id']}", json={"name": "Kareler", "favorite": True}
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Kareler"
        assert updated.json()["favorite"] is True

        assert client.delete(f"/api/targets/{target['id']}").status_code == 204
        assert client.get(f"/api/targets/{target['id']}").status_code in (404, 405)
        # Disk uzerindeki klasor silinmez.
        assert (target_root / "Fotograflar").exists()

    def test_kok_disi_yol_reddedilir(self, client, paired, tmp_path: Path) -> None:
        disari = tmp_path / "gizli"
        disari.mkdir()
        response = client.post(
            "/api/targets", json={"name": "Gizli", "path": str(disari)}
        )
        assert response.status_code in (403, 422)
        assert str(disari) not in response.text

    def test_bilinmeyen_hedef_404(self, client, paired) -> None:
        assert client.put("/api/targets/yok", json={"name": "X"}).status_code == 404
        assert client.delete("/api/targets/yok").status_code == 404


class TestDevices:
    def test_listeleme_token_icermez(self, client, paired) -> None:
        devices = client.get("/api/devices").json()
        assert len(devices) == 1
        assert devices[0]["id"] == paired["device_id"]
        assert "token" not in devices[0]
        assert "token_hash" not in devices[0]

    def test_ws_yokken_cihaz_offline(self, client, paired) -> None:
        devices = client.get("/api/devices").json()
        assert devices[0]["online"] is False

    def test_ws_bagliyken_cihaz_online(self, client, paired) -> None:
        with client.websocket_connect(f"/api/ws?token={paired['token']}"):
            devices = client.get("/api/devices").json()
            target = next(d for d in devices if d["id"] == paired["device_id"])
            assert target["online"] is True
        assert client.get("/api/devices").json()[0]["online"] is False

    def test_bilinmeyen_cihaz_404(self, client, paired) -> None:
        assert client.delete("/api/devices/yok").status_code == 404


class TestSettings:
    def test_oku_ve_guncelle(self, client, paired) -> None:
        current = client.get("/api/settings").json()
        assert current["conflict_policy"] == "rename"
        # MVP disi ozellikler varsayilan olarak kapalidir.
        assert current["ai_enabled"] is False
        assert current["notify_enabled"] is False

        updated = client.put(
            "/api/settings", json={"conflict_policy": "skip", "naming_template": "{date}_{original}"}
        )
        assert updated.status_code == 200
        assert updated.json()["conflict_policy"] == "skip"
        assert client.get("/api/settings").json()["naming_template"] == "{date}_{original}"

    def test_gecersiz_deger_reddedilir(self, client, paired) -> None:
        assert client.put("/api/settings", json={"conflict_policy": "sil"}).status_code == 422
        assert client.put("/api/settings", json={"chunk_size": 1}).status_code == 422

    def test_bilinmeyen_alan_reddedilir(self, client, paired) -> None:
        assert client.put("/api/settings", json={"gizli": True}).status_code == 422

    def test_telefon_remote_launch_acamaz(self, client, paired) -> None:
        # paired fixture istemciyi cihaz token'i ile isaretler (loopback degil).
        before = client.get("/api/settings").json()["remote_launch_enabled"]
        assert before is False

        response = client.put("/api/settings", json={"remote_launch_enabled": True})
        assert response.status_code == 403

        assert client.get("/api/settings").json()["remote_launch_enabled"] is False

    def test_telefon_remote_browse_degistiremez(self, client, paired) -> None:
        # paired fixture istemciyi cihaz token'i ile isaretler (loopback degil).
        before = client.get("/api/settings").json()["remote_browse_enabled"]

        response = client.put("/api/settings", json={"remote_browse_enabled": not before})
        assert response.status_code == 403

        assert client.get("/api/settings").json()["remote_browse_enabled"] == before


class TestApps:
    def test_listeleme_exe_path_icermez(self, client, tmp_path: Path) -> None:
        exe = tmp_path / "notepad.exe"
        exe.write_bytes(b"MZ")
        created = client.post(
            "/api/apps", json={"name": "Not Defteri", "exe_path": str(exe)}
        )
        assert created.status_code == 201, created.text
        body = created.json()
        assert "exe_path" not in body
        assert "args" not in body

        listing = client.get("/api/apps").json()
        assert any(item["id"] == body["id"] for item in listing)
        for item in listing:
            assert "exe_path" not in item
            assert "args" not in item

    def test_telefon_token_ile_kayit_reddedilir(self, client, paired, tmp_path: Path) -> None:
        exe = tmp_path / "app.exe"
        exe.write_bytes(b"MZ")
        response = client.post(
            "/api/apps", json={"name": "App", "exe_path": str(exe)}
        )
        assert response.status_code == 403

    def test_telefon_token_ile_silme_reddedilir(self, client, paired) -> None:
        assert client.delete("/api/apps/yok").status_code == 403

    def test_txt_uzantisi_reddedilir(self, client, tmp_path: Path) -> None:
        f = tmp_path / "app.txt"
        f.write_text("hello")
        response = client.post("/api/apps", json={"name": "App", "exe_path": str(f)})
        assert response.status_code == 422

    def test_olmayan_yol_reddedilir(self, client, tmp_path: Path) -> None:
        response = client.post(
            "/api/apps", json={"name": "App", "exe_path": str(tmp_path / "yok.exe")}
        )
        assert response.status_code == 422

    def test_goreli_yol_reddedilir(self, client) -> None:
        response = client.post(
            "/api/apps", json={"name": "App", "exe_path": "notepad.exe"}
        )
        assert response.status_code == 422

    def test_launch_varsayilan_kapali(self, client, tmp_path: Path) -> None:
        exe = tmp_path / "app.exe"
        exe.write_bytes(b"MZ")
        created = client.post("/api/apps", json={"name": "App", "exe_path": str(exe)})
        assert created.status_code == 201
        app_id = created.json()["id"]
        response = client.post(f"/api/apps/{app_id}/launch")
        assert response.status_code == 403

    def test_launch_subprocess_guvenli_cagrilir(
        self, client, state, tmp_path: Path, monkeypatch
    ) -> None:
        exe = tmp_path / "app.exe"
        exe.write_bytes(b"MZ")
        created = client.post("/api/apps", json={"name": "App", "exe_path": str(exe)})
        assert created.status_code == 201
        app_id = created.json()["id"]

        state.config.remote_launch_enabled = True

        calls: list[dict] = []

        class _FakeProc:
            pid = 1234

        def fake_popen(cmd, **kwargs):
            calls.append({"cmd": cmd, "kwargs": kwargs})
            return _FakeProc()

        import phoneshare_receiver.services.apps as apps_module

        monkeypatch.setattr(apps_module.subprocess, "Popen", fake_popen)

        response = client.post(f"/api/apps/{app_id}/launch")
        assert response.status_code == 200, response.text
        assert len(calls) == 1
        assert isinstance(calls[0]["cmd"], list)
        assert calls[0]["cmd"][0] == str(exe)
        assert calls[0]["kwargs"]["shell"] is False


class TestTransfersFilters:
    def test_filtreler(self, client, belgeler) -> None:
        from .conftest import upload_file

        for name in ("a.txt", "b.txt"):
            init, _ = upload_file(client, b"veri" * 10, filename=name, target_id=belgeler)
            client.post(f"/api/uploads/{init['upload_id']}/complete")

        assert client.get("/api/transfers", params={"q": "a."}).json()["total"] == 1
        assert client.get(
            "/api/transfers", params={"status": "COMPLETED"}
        ).json()["total"] == 2
        assert client.get("/api/transfers", params={"status": "FAILED"}).json()["total"] == 0
        page = client.get("/api/transfers", params={"limit": 1, "offset": 1}).json()
        assert page["total"] == 2 and len(page["items"]) == 1
        assert client.get("/api/transfers/yok").status_code == 404


class TestSpa:
    def test_placeholder_sayfasi(self, client) -> None:
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

    def test_api_yolu_etkilenmez(self, client) -> None:
        assert client.get("/api/health").headers["content-type"].startswith(
            "application/json"
        )
        assert client.get("/api/bilinmeyen").status_code == 404

    def test_dist_servis_edilir(self, state, tmp_path: Path, monkeypatch) -> None:
        from phoneshare_receiver.app import create_app

        dist = tmp_path / "web-out"
        dist.mkdir()
        (dist / "index.html").write_text("<html>PWA</html>", encoding="utf-8")
        (dist / "sw.js").write_text("self.addEventListener('install',()=>{})", encoding="utf-8")
        (dist / "manifest.webmanifest").write_text('{"name":"PhoneShare"}', encoding="utf-8")
        (dist / "_next").mkdir()
        (dist / "_next" / "app.js").write_text("console.log(1)", encoding="utf-8")
        (dist / "index.txt").write_text("0:RSC-ROOT", encoding="utf-8")
        (dist / "stats").mkdir()
        (dist / "stats" / "index.html").write_text("<html>Stats</html>", encoding="utf-8")
        (dist / "stats" / "index.txt").write_text("0:RSC-STATS", encoding="utf-8")

        with TestClient(create_app(state, configure_logging=False, web_dist=dist)) as tc:
            index = tc.get("/")
            assert index.status_code == 200
            assert "PWA" in index.text
            assert "no-store" in index.headers["cache-control"]

            sw = tc.get("/sw.js")
            assert sw.status_code == 200
            assert "no-store" in sw.headers["cache-control"]
            assert "javascript" in sw.headers["content-type"]

            manifest = tc.get("/manifest.webmanifest")
            assert manifest.status_code == 200
            assert "no-store" in manifest.headers["cache-control"]

            asset = tc.get("/_next/app.js")
            assert asset.status_code == 200
            assert "max-age" in asset.headers["cache-control"]

            # SPA fallback: bilinmeyen yol index.html doner, /api etkilenmez.
            assert tc.get("/ayarlar/hedefler").text == "<html>PWA</html>"
            assert tc.get("/api/health").status_code == 200

            # Traversal denemesi index'e duser, disari cikmaz.
            assert "PWA" in tc.get("/../../gizli.txt").text

            # Dizin icindeki index.html: trailing slash olmadan da dogru sayfa doner.
            stats = tc.get("/stats")
            assert stats.status_code == 200
            assert stats.text == "<html>Stats</html>"
            assert tc.get("/stats/").text == "<html>Stats</html>"

            # RSC (istemci tarafi gezinme) istegine HTML degil payload doner;
            # aksi halde Next tam sayfa yeniden yuklemesine duser.
            rsc = tc.get("/stats/", headers={"RSC": "1"})
            assert rsc.text == "0:RSC-STATS"
            assert rsc.headers["content-type"].startswith("text/x-component")
            assert tc.get("/stats/", params={"_rsc": "abc12"}).text == "0:RSC-STATS"
            # Bilinmeyen yol icin RSC fallback'i kok payload'dir.
            assert tc.get("/ayarlar/hedefler", headers={"RSC": "1"}).text == "0:RSC-ROOT"

            # Dizin yoksa davranis degismez: hala ana index.html.
            assert tc.get("/transfers").text == "<html>PWA</html>"


class TestWebSocket:
    def test_token_gerekir(self, client, paired) -> None:
        import pytest
        from starlette.websockets import WebSocketDisconnect

        with (
            pytest.raises(WebSocketDisconnect),
            client.websocket_connect("/api/ws?token=sahte") as ws,
        ):
            ws.receive_text()

    def test_online_olayi(self, client, paired) -> None:
        with client.websocket_connect(f"/api/ws?token={paired['token']}") as ws:
            event = ws.receive_json()
            assert event["event"] == "receiver.online"
