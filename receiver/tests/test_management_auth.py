"""Regression coverage for the loopback management boundary."""

from __future__ import annotations


def _local_headers(port: int = 8766) -> dict[str, str]:
    return {"Host": f"127.0.0.1:{port}", "Origin": f"http://127.0.0.1:{port}"}


def test_local_session_rejects_cross_site_and_bad_host(client, state) -> None:
    state.management_port = 8766
    assert client.post("/api/local-session", headers={"Host": "evil.test:8766", "Origin": "http://evil.test:8766"}).status_code == 403
    assert client.post("/api/local-session", headers={"Host": "127.0.0.1:8766", "Origin": "null"}).status_code == 403
    assert client.post("/api/local-session", headers=_local_headers()).status_code == 200


def test_local_session_accepts_only_real_capability(client, state) -> None:
    state.management_port = 8766
    state.local_capability = "test-capability"
    assert client.post("/api/local-session", headers={"X-PhoneShare-Local-Token": "wrong"}).status_code == 403
    response = client.post("/api/local-session", headers={"X-PhoneShare-Local-Token": "test-capability"})
    assert response.status_code == 200
    assert response.json() == {"authenticated": True}
    assert "HttpOnly" in response.headers["set-cookie"]


def test_ws_ticket_is_single_use(client, state) -> None:
    state.management_port = 8766
    state.local_capability = "test-capability"
    response = client.post("/api/ws-ticket", headers={"X-PhoneShare-Local-Token": "test-capability"})
    assert response.status_code == 200
    ticket = response.json()["ticket"]
    assert response.json()["expires_in"] == 30
    with client.websocket_connect(f"/api/ws?ticket={ticket}") as socket:
        assert socket.receive_json()["event"] == "receiver.online"
    try:
        with client.websocket_connect(f"/api/ws?ticket={ticket}"):
            pass
    except Exception:
        pass
    else:
        raise AssertionError("ticket ikinci kez kabul edildi")
