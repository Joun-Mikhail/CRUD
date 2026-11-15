from __future__ import annotations

import base64
import json

import pytest

from notes_api.errors import InvalidCursorError
from notes_api.models.note import PageCursor
from notes_api.pagination import decode_cursor, encode_cursor

NOTE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
CURSOR = PageCursor(user_sort_key=f"2026-01-01T00:00:00.000Z#{NOTE_ID}", note_id=NOTE_ID)


def _token(payload: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


def test_round_trip() -> None:
    token = encode_cursor(CURSOR)
    assert "=" not in token
    assert decode_cursor(token) == CURSOR


def test_token_never_contains_a_user_id() -> None:
    decoded = json.loads(base64.urlsafe_b64decode(encode_cursor(CURSOR) + "=="))
    assert set(decoded) == {"k", "n"}


@pytest.mark.parametrize(
    "token",
    [
        "",
        "!!!not-base64!!!",
        "x" * 600,
        _token("string"),
        _token([1, 2]),
        _token({"k": CURSOR.user_sort_key}),
        _token({"k": CURSOR.user_sort_key, "n": NOTE_ID, "userId": "victim"}),
        _token({"k": 1, "n": NOTE_ID}),
        _token({"k": CURSOR.user_sort_key, "n": "not-a-uuid"}),
        _token({"k": "2026-01-01T00:00:00.000Z#other", "n": NOTE_ID}),
        _token({"k": "x" * 200 + f"#{NOTE_ID}", "n": NOTE_ID}),
        base64.urlsafe_b64encode(b"\xff\xfe").decode(),
    ],
)
def test_invalid_tokens_are_client_errors(token: str) -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor(token)
