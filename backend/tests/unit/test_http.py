"""Handler wrapper behaviour: envelopes, headers, error mapping, logging."""

from __future__ import annotations

import base64
import json
from types import SimpleNamespace
from typing import Any

import pytest

from notes_api import operations
from notes_api.config import load_settings
from notes_api.http import Request, Result, api_handler
from notes_api.services.notes_service import NotesService
from tests.conftest import ALICE, ORIGIN, make_event


def _handler(operation: Any, scope: str = operations.SCOPE_READ) -> Any:
    return api_handler(
        "TestOp",
        scope,
        operation,
        lambda: None,  # type: ignore[arg-type, return-value]
        cors_allow_origin=lambda: ORIGIN,
    )


def _logs(capsys: pytest.CaptureFixture[str]) -> list[dict[str, Any]]:
    return [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]


def test_success_envelope_headers_and_log(capsys: pytest.CaptureFixture[str]) -> None:
    def op(request: Request, _: NotesService) -> Result:
        return Result(200, {"hello": request.user_id}, meta={"count": 1})

    response = _handler(op)(make_event(), None)
    assert response["statusCode"] == 200
    assert json.loads(response["body"]) == {"data": {"hello": ALICE}, "meta": {"count": 1}}
    headers = response["headers"]
    assert headers["Content-Type"] == "application/json"
    assert headers["Access-Control-Allow-Origin"] == ORIGIN
    assert headers["Cache-Control"] == "no-store"
    assert headers["X-Content-Type-Options"] == "nosniff"

    (entry,) = _logs(capsys)
    assert entry["message"] == "request_completed"
    assert entry["operation"] == "TestOp"
    assert entry["status"] == 200
    assert entry["requestId"] == "req-test-123"
    assert entry["userId"] == ALICE
    assert isinstance(entry["durationMs"], float)


def test_unexpected_exception_becomes_generic_500(capsys: pytest.CaptureFixture[str]) -> None:
    def op(_: Request, __: NotesService) -> Result:
        raise RuntimeError("secret internal detail: table arn:aws:dynamodb:xyz")

    response = _handler(op)(make_event(), None)
    body = json.loads(response["body"])
    assert response["statusCode"] == 500
    assert body == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "requestId": "req-test-123",
        }
    }
    assert "secret" not in response["body"]
    assert "Traceback" not in response["body"]

    logs = _logs(capsys)
    assert logs[0]["message"] == "unhandled_exception"
    assert "RuntimeError" in logs[0]["stackTrace"]  # full detail stays in CloudWatch only
    assert logs[1]["status"] == 500
    assert logs[1]["errorCategory"] == "server"


def test_missing_authorizer_context_is_401() -> None:
    response = _handler(lambda r, s: Result(200, {}))(make_event(user=None), None)
    assert response["statusCode"] == 401
    assert json.loads(response["body"])["error"]["code"] == "UNAUTHORIZED"


def test_missing_scope_is_403() -> None:
    event = make_event(claims={"sub": ALICE, "token_use": "access", "scope": "notes/read"})
    response = _handler(lambda r, s: Result(200, {}), operations.SCOPE_WRITE)(event, None)
    assert response["statusCode"] == 403


def test_request_id_falls_back_to_lambda_context() -> None:
    event = make_event(user=None)
    event["requestContext"] = {}
    response = _handler(lambda r, s: Result(200, {}))(
        event, SimpleNamespace(aws_request_id="lambda-req-9")
    )
    assert json.loads(response["body"])["error"]["requestId"] == "lambda-req-9"


def test_base64_body_is_decoded() -> None:
    seen: list[str | None] = []

    def op(request: Request, _: NotesService) -> Result:
        seen.append(request.body)
        return Result(200, {})

    event = make_event("POST", body=base64.b64encode(b'{"a": 1}').decode())
    event["isBase64Encoded"] = True
    assert _handler(op)(event, None)["statusCode"] == 200
    assert seen == ['{"a": 1}']

    event["body"] = "%%% not base64 %%%"
    assert _handler(op)(event, None)["statusCode"] == 400


def test_wrong_content_type_and_non_string_body() -> None:
    op = lambda r, s: Result(200, {})  # noqa: E731
    event = make_event("POST", body="title=x", headers={"content-type": "text/plain"})
    assert _handler(op)(event, None)["statusCode"] == 415
    event = make_event("POST")
    event["body"] = {"already": "parsed"}
    assert _handler(op)(event, None)["statusCode"] == 400


def test_settings_loading() -> None:
    settings = load_settings({"NOTES_TABLE_NAME": "t", "LOG_LEVEL": "debug"})
    assert settings.table_name == "t"
    assert settings.user_index_name == "byUser"
    assert settings.log_level == "DEBUG"
    with pytest.raises(KeyError):
        load_settings({})
