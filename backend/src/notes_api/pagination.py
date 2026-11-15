"""Opaque pagination tokens: base64url(JSON) of a PageCursor."""

from __future__ import annotations

import base64
import binascii
import json

from notes_api.errors import InvalidCursorError
from notes_api.models.note import PageCursor
from notes_api.validation.notes import is_uuid

_MAX_TOKEN_LENGTH = 512
_MAX_SORT_KEY_LENGTH = 128


def encode_cursor(cursor: PageCursor) -> str:
    raw = json.dumps({"k": cursor.user_sort_key, "n": cursor.note_id}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(token: str) -> PageCursor:
    """Parse a client-supplied token. Anything unexpected is a 400, never a 500."""
    error = InvalidCursorError("The nextToken value is not a valid pagination token")
    if not token or len(token) > _MAX_TOKEN_LENGTH:
        raise error
    try:
        padded = token + "=" * (-len(token) % 4)
        payload = json.loads(base64.b64decode(padded, altchars=b"-_", validate=True))
    except (binascii.Error, ValueError, UnicodeDecodeError):
        raise error from None
    if not isinstance(payload, dict) or set(payload) != {"k", "n"}:
        raise error
    sort_key, note_id = payload["k"], payload["n"]
    if not isinstance(sort_key, str) or not isinstance(note_id, str):
        raise error
    if len(sort_key) > _MAX_SORT_KEY_LENGTH or not is_uuid(note_id):
        raise error
    if not sort_key.endswith(f"#{note_id}"):
        raise error
    return PageCursor(user_sort_key=sort_key, note_id=note_id)
