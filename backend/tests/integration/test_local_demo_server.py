"""HTTP-level tests of the Local Demo server (real sockets, real handlers, moto storage).

These prove the demo wiring only. They do NOT prove Cognito/JWT validation - that is
done by API Gateway in AWS and covered by scripts/testing/live_api_tests.py.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from collections.abc import Iterator
from typing import Any
from unittest.mock import MagicMock

import pytest

from local_demo.server import DemoRequestHandler, build_server


@pytest.fixture
def base_url() -> Iterator[str]:
    server, stop = build_server(0, with_seed=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        thread.join(timeout=5)
        stop()


def request(
    base_url: str,
    method: str,
    path: str,
    *,
    user: str | None = "alice",
    body: Any = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, Any] | None, dict[str, str]]:
    all_headers = {"Content-Type": "application/json", **(headers or {})}
    if user:
        all_headers["Authorization"] = f"Demo {user}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base_url + path, data=data, method=method, headers=all_headers)  # noqa: S310
    try:
        with urllib.request.urlopen(req, timeout=10) as response:  # noqa: S310
            raw = response.read()
            return response.status, json.loads(raw) if raw else None, dict(response.headers)
    except urllib.error.HTTPError as error:
        raw = error.read()
        return error.code, json.loads(raw) if raw else None, dict(error.headers)


def test_health_and_demo_marker(base_url: str) -> None:
    status, body, headers = request(base_url, "GET", "/health", user=None)
    assert (status, body) == (200, {"data": {"status": "ok", "mode": "local-demo"}})
    assert headers["X-Demo-Mode"] == "local-demo"


def test_crud_journey_over_http(base_url: str) -> None:
    status, body, _ = request(base_url, "POST", "/notes", body={"title": "T", "content": "C"})
    assert status == 201
    assert body
    note_id = body["data"]["noteId"]
    assert request(base_url, "GET", f"/notes/{note_id}")[0] == 200
    status, body, _ = request(
        base_url, "PUT", f"/notes/{note_id}", body={"title": "T2", "content": "C2", "version": 1}
    )
    assert status == 200
    assert body
    assert body["data"]["version"] == 2
    assert request(base_url, "DELETE", f"/notes/{note_id}")[0] == 200
    assert request(base_url, "GET", f"/notes/{note_id}")[0] == 404


@pytest.mark.parametrize("user", [None, "mallory", "ALICE "])
def test_unknown_or_missing_identity(base_url: str, user: str | None) -> None:
    headers = {"Authorization": "Bearer something"} if user is None else None
    status, body, _ = request(base_url, "GET", "/notes", user=user, headers=headers)
    if user == "ALICE ":
        assert status == 200  # names are case-insensitive and trimmed
    else:
        assert status == 401
        assert body
        assert body["error"]["code"] == "UNAUTHORIZED"


def test_demo_users_are_isolated(base_url: str) -> None:
    _, alice, _ = request(base_url, "GET", "/notes", user="alice")
    _, bob, _ = request(base_url, "GET", "/notes", user="bob")
    assert alice
    assert bob
    assert {n["userId"] for n in alice["data"]} == {"demo-user-alice"}
    assert {n["userId"] for n in bob["data"]} == {"demo-user-bob"}
    bobs_id = bob["data"][0]["noteId"]
    assert request(base_url, "GET", f"/notes/{bobs_id}", user="alice")[0] == 403
    assert request(base_url, "DELETE", f"/notes/{bobs_id}", user="alice")[0] == 403


def test_routing_errors_and_cors(base_url: str) -> None:
    assert request(base_url, "GET", "/nope")[0] == 404
    assert request(base_url, "PATCH", "/notes")[0] == 405
    assert request(base_url, "DELETE", "/notes")[0] == 405
    status, _, headers = request(
        base_url, "OPTIONS", "/notes", user=None, headers={"Origin": "http://localhost:5173"}
    )
    assert status == 204
    assert headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    _, _, headers = request(
        base_url, "GET", "/health", user=None, headers={"Origin": "https://evil.example"}
    )
    assert "Access-Control-Allow-Origin" not in headers


def test_reset_restores_seed_data(base_url: str) -> None:
    request(base_url, "POST", "/notes", body={"title": "extra", "content": ""})
    assert request(base_url, "POST", "/__demo/reset", user=None)[0] == 200
    _, body, _ = request(base_url, "GET", "/notes")
    assert body
    assert body["meta"]["count"] == 2


@pytest.mark.parametrize("error", [BrokenPipeError, ConnectionResetError, ConnectionAbortedError])
def test_cancelled_request_is_ignored(error: type[ConnectionError]) -> None:
    """A browser that goes away mid-response must not produce a traceback (Windows: aborted)."""
    handler = MagicMock()
    handler.headers.get.return_value = None
    handler.wfile.write.side_effect = error()

    DemoRequestHandler._send(handler, 200, {"data": []})

    handler.wfile.write.assert_called_once()
