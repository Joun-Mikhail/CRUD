from __future__ import annotations

from typing import Any

import pytest

from notes_api.config import CONTENT_MAX_LENGTH, MAX_BODY_BYTES, TITLE_MAX_LENGTH
from notes_api.errors import MalformedJsonError, PayloadTooLargeError, ValidationError
from notes_api.validation.notes import (
    parse_json_object,
    validate_note_id,
    validate_note_input,
    validate_page_size,
)


def test_valid_input_is_accepted_and_title_trimmed() -> None:
    result = validate_note_input({"title": "  Hello  ", "content": " body "}, allow_version=False)
    assert result.title == "Hello"
    assert result.content == " body "  # content is stored exactly as sent
    assert result.expected_version is None


def test_boundary_lengths_are_accepted() -> None:
    result = validate_note_input(
        {"title": "t" * TITLE_MAX_LENGTH, "content": "c" * CONTENT_MAX_LENGTH},
        allow_version=False,
    )
    assert len(result.title) == TITLE_MAX_LENGTH
    assert validate_note_input({"title": "t", "content": ""}, allow_version=False).content == ""


@pytest.mark.parametrize(
    ("payload", "field", "issue"),
    [
        ({"content": "c"}, "title", "is required"),
        ({"title": "t"}, "content", "is required"),
        ({"title": 123, "content": "c"}, "title", "must be a string"),
        ({"title": None, "content": "c"}, "title", "must be a string"),
        ({"title": ["t"], "content": "c"}, "title", "must be a string"),
        ({"title": "   ", "content": "c"}, "title", "must not be empty"),
        ({"title": "", "content": "c"}, "title", "must not be empty"),
        ({"title": "t" * (TITLE_MAX_LENGTH + 1), "content": "c"}, "title", "at most"),
        ({"title": "a\nb", "content": "c"}, "title", "control characters"),
        ({"title": "t", "content": 5}, "content", "must be a string"),
        ({"title": "t", "content": {"a": 1}}, "content", "must be a string"),
        ({"title": "t", "content": "c" * (CONTENT_MAX_LENGTH + 1)}, "content", "at most"),
        ({"title": "t", "content": "a\x00b"}, "content", "NUL"),
        ({"title": "t", "content": "c", "userId": "someone-else"}, "userId", "unknown field"),
        ({"title": "t", "content": "c", "noteId": "x"}, "noteId", "unknown field"),
        ({"title": "t", "content": "c", "version": 1}, "version", "unknown field"),
    ],
)
def test_invalid_create_input(payload: dict[str, Any], field: str, issue: str) -> None:
    with pytest.raises(ValidationError) as caught:
        validate_note_input(payload, allow_version=False)
    details = caught.value.details or []
    assert any(d["field"] == field and issue in d["issue"] for d in details), details


def test_all_problems_are_reported_together() -> None:
    with pytest.raises(ValidationError) as caught:
        validate_note_input({"extra": 1}, allow_version=False)
    assert {d["field"] for d in caught.value.details or []} == {"extra", "title", "content"}


def test_update_accepts_optional_version() -> None:
    payload = {"title": "t", "content": "c", "version": 3}
    assert validate_note_input(payload, allow_version=True).expected_version == 3


@pytest.mark.parametrize("version", [0, -1, "1", 1.5, True, None])
def test_update_rejects_bad_version(version: Any) -> None:
    with pytest.raises(ValidationError):
        validate_note_input({"title": "t", "content": "c", "version": version}, allow_version=True)


@pytest.mark.parametrize(
    "body", [None, "", "   ", "{", "{'a': 1}", "[1, 2]", '"text"', "42", "null"]
)
def test_malformed_or_non_object_json(body: str | None) -> None:
    with pytest.raises(MalformedJsonError):
        parse_json_object(body)


def test_deeply_nested_json_does_not_crash() -> None:
    with pytest.raises((MalformedJsonError, ValidationError)):
        validate_note_input(parse_json_object("[" * 100_000), allow_version=False)


def test_oversized_body_is_rejected() -> None:
    with pytest.raises(PayloadTooLargeError):
        parse_json_object('{"title": "' + "x" * MAX_BODY_BYTES + '"}')


def test_empty_object_parses_but_fails_validation() -> None:
    with pytest.raises(ValidationError):
        validate_note_input(parse_json_object("{}"), allow_version=False)


def test_note_id_validation() -> None:
    assert (
        validate_note_id("3F2504E0-4F89-41D3-9A0C-0305E82C3301")
        == "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    )
    for bad in [None, "", "123", "not-a-uuid", "3f2504e0-4f89-41d3-9a0c-0305e82c330", "../etc"]:
        with pytest.raises(ValidationError):
            validate_note_id(bad)


def test_page_size() -> None:
    assert validate_page_size(None) == 20
    assert validate_page_size("1") == 1
    assert validate_page_size("100") == 100
    for bad in ["0", "101", "-1", "abc", "1.5", "", " 5", "99999"]:
        with pytest.raises(ValidationError):
            validate_page_size(bad)
