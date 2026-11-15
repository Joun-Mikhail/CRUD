from __future__ import annotations

from typing import Any

import pytest

from notes_api.errors import ForbiddenError, UnauthenticatedError
from notes_api.security.identity import get_user_id, require_scope


def _event(claims: Any) -> dict[str, Any]:
    return {"requestContext": {"authorizer": {"claims": claims}}}


def test_subject_is_returned_for_access_token() -> None:
    assert get_user_id(_event({"sub": "abc-123", "token_use": "access"})) == "abc-123"


@pytest.mark.parametrize(
    "event",
    [
        {},
        {"requestContext": None},
        {"requestContext": {}},
        {"requestContext": {"authorizer": None}},
        {"requestContext": {"authorizer": {}}},
        _event(None),
        _event({}),
        _event({"sub": ""}),
        _event({"sub": 42}),
        _event({"sub": "x" * 200}),
    ],
)
def test_missing_identity_is_unauthenticated(event: dict[str, Any]) -> None:
    with pytest.raises(UnauthenticatedError):
        get_user_id(event)


def test_id_token_is_refused() -> None:
    with pytest.raises(UnauthenticatedError):
        get_user_id(_event({"sub": "abc", "token_use": "id"}))


def test_identity_is_never_read_from_headers_or_body() -> None:
    event = {
        "headers": {"x-user-id": "attacker", "sub": "attacker"},
        "body": '{"userId": "attacker", "sub": "attacker"}',
        "queryStringParameters": {"userId": "attacker"},
        "requestContext": {},
    }
    with pytest.raises(UnauthenticatedError):
        get_user_id(event)


def test_scope_check() -> None:
    event = _event({"sub": "abc", "scope": "openid notes/read"})
    require_scope(event, "notes/read")
    with pytest.raises(ForbiddenError):
        require_scope(event, "notes/write")
    with pytest.raises(ForbiddenError):
        require_scope(_event({"sub": "abc"}), "notes/read")
