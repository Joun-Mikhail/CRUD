"""Input validation for note requests.

Rules (also documented in docs/api/API.md):
* The body must be a JSON object with exactly the fields `title` and `content`
  (PUT additionally accepts an optional integer `version`). Unknown fields are rejected.
* No implicit type conversion: 123 is not accepted as a title.
* `title` is trimmed; it must then contain 1..200 characters.
* `content` is stored as sent; 0..20,000 characters.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from notes_api.config import (
    CONTENT_MAX_LENGTH,
    MAX_BODY_BYTES,
    PAGE_SIZE_DEFAULT,
    PAGE_SIZE_MAX,
    TITLE_MAX_LENGTH,
)
from notes_api.errors import (
    MalformedJsonError,
    PayloadTooLargeError,
    ValidationError,
)

# Canonical lower/upper-case textual UUID (any version), e.g. produced by uuid.uuid4().
_UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
# Control characters that have no place in a single-line title.
_TITLE_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f]")


@dataclass(frozen=True)
class NoteInput:
    title: str
    content: str
    expected_version: int | None = None


def is_uuid(value: str) -> bool:
    return bool(_UUID_PATTERN.match(value))


def validate_note_id(value: str | None) -> str:
    if not value or not is_uuid(value):
        raise ValidationError(
            "The note id must be a valid UUID",
            [{"field": "id", "issue": "must be a UUID"}],
        )
    return value.lower()


def parse_json_object(body: str | None) -> dict[str, Any]:
    """Parse the raw request body into a JSON object."""
    if body is None or body.strip() == "":
        raise MalformedJsonError("The request body must be a JSON object")
    if len(body.encode("utf-8")) > MAX_BODY_BYTES:
        raise PayloadTooLargeError(f"The request body must not exceed {MAX_BODY_BYTES} bytes")
    try:
        parsed = json.loads(body)
    except (ValueError, RecursionError):
        raise MalformedJsonError("The request body is not valid JSON") from None
    if not isinstance(parsed, dict):
        raise MalformedJsonError("The request body must be a JSON object")
    return parsed


def validate_note_input(payload: dict[str, Any], *, allow_version: bool) -> NoteInput:
    """Validate a create (POST) or full-replace update (PUT) payload."""
    issues: list[dict[str, Any]] = []
    allowed = {"title", "content"} | ({"version"} if allow_version else set())

    for name in sorted(set(payload) - allowed):
        issues.append({"field": name, "issue": "unknown field"})

    title = _validate_title(payload, issues)
    content = _validate_content(payload, issues)
    version = _validate_version(payload, issues) if allow_version else None

    if issues:
        raise ValidationError(_summary(issues), issues)
    return NoteInput(title=title, content=content, expected_version=version)


def _validate_title(payload: dict[str, Any], issues: list[dict[str, Any]]) -> str:
    if "title" not in payload:
        issues.append({"field": "title", "issue": "is required"})
        return ""
    title = payload["title"]
    if not isinstance(title, str):
        issues.append({"field": "title", "issue": "must be a string"})
        return ""
    title = title.strip()
    if not title:
        issues.append({"field": "title", "issue": "must not be empty"})
    elif len(title) > TITLE_MAX_LENGTH:
        issues.append({"field": "title", "issue": f"must be at most {TITLE_MAX_LENGTH} characters"})
    elif _TITLE_FORBIDDEN.search(title):
        issues.append({"field": "title", "issue": "must not contain control characters"})
    return title


def _validate_content(payload: dict[str, Any], issues: list[dict[str, Any]]) -> str:
    if "content" not in payload:
        issues.append({"field": "content", "issue": "is required"})
        return ""
    content = payload["content"]
    if not isinstance(content, str):
        issues.append({"field": "content", "issue": "must be a string"})
        return ""
    if len(content) > CONTENT_MAX_LENGTH:
        issues.append(
            {"field": "content", "issue": f"must be at most {CONTENT_MAX_LENGTH} characters"}
        )
    elif "\x00" in content:
        issues.append({"field": "content", "issue": "must not contain NUL characters"})
    return content


def _validate_version(payload: dict[str, Any], issues: list[dict[str, Any]]) -> int | None:
    if "version" not in payload:
        return None
    version = payload["version"]
    # bool is a subclass of int in Python; reject it explicitly.
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        issues.append({"field": "version", "issue": "must be a positive integer"})
        return None
    return version


def _summary(issues: list[dict[str, Any]]) -> str:
    first = issues[0]
    return f"The {first['field']} field {first['issue']}"


def validate_page_size(raw: str | None) -> int:
    """Validate the `limit` query parameter (1..PAGE_SIZE_MAX, default PAGE_SIZE_DEFAULT)."""
    if raw is None:
        return PAGE_SIZE_DEFAULT
    if not re.fullmatch(r"[0-9]{1,4}", raw) or not 1 <= int(raw) <= PAGE_SIZE_MAX:
        raise ValidationError(
            f"The limit parameter must be an integer between 1 and {PAGE_SIZE_MAX}",
            [{"field": "limit", "issue": f"must be an integer between 1 and {PAGE_SIZE_MAX}"}],
        )
    return int(raw)
