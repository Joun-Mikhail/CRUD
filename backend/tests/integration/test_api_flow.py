"""Full request path: API Gateway event -> handler -> service -> repository (moto) -> response.

`test_thesis_table_*` reproduces the 13 test cases of the semestral thesis (table in the
"Request Handling and Validation" section). Rows 2 and 5 (missing token) are rejected by
API Gateway in AWS; here they are exercised at the Lambda boundary (no authorizer context).
"""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

import pytest

from tests.conftest import ALICE, BOB, VALID_BODY, Handler, call, create_note, make_event

MISSING_ID = "00000000-0000-4000-8000-000000000000"
ISO_UTC = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
Handlers = dict[str, Handler]


def test_thesis_table_01_post_valid_returns_201(handlers: Handlers) -> None:
    status, body = call(handlers["create"], make_event("POST", body=VALID_BODY))
    assert status == 201
    note = body["data"]
    assert uuid.UUID(note["noteId"]).version == 4
    assert note["userId"] == ALICE
    assert note["title"] == VALID_BODY["title"]
    assert note["content"] == VALID_BODY["content"]
    assert ISO_UTC.match(note["createdAt"])
    assert note["createdAt"] == note["updatedAt"]
    assert note["version"] == 1
    assert set(note) == {
        "noteId", "userId", "title", "content", "createdAt", "updatedAt", "version",
    }  # fmt: skip


def test_thesis_table_02_post_missing_token_returns_401(handlers: Handlers) -> None:
    status, body = call(handlers["create"], make_event("POST", user=None, body=VALID_BODY))
    assert (status, body["error"]["code"]) == (401, "UNAUTHORIZED")


def test_thesis_table_03_post_missing_title_returns_400(handlers: Handlers) -> None:
    status, body = call(handlers["create"], make_event("POST", body={"content": "c"}))
    assert status == 400
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"] == "The title field is required"
    assert body["error"]["details"] == [{"field": "title", "issue": "is required"}]
    assert body["error"]["requestId"] == "req-test-123"


def test_thesis_table_04_list_returns_200(handlers: Handlers) -> None:
    create_note(handlers)
    status, body = call(handlers["list"], make_event("GET"))
    assert status == 200
    assert len(body["data"]) == 1
    assert body["meta"] == {"count": 1, "limit": 20, "nextToken": None}


def test_thesis_table_05_list_missing_token_returns_401(handlers: Handlers) -> None:
    status, _ = call(handlers["list"], make_event("GET", user=None))
    assert status == 401


def test_thesis_table_06_get_own_note_returns_200(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, body = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert status == 200
    assert body["data"] == note


def test_thesis_table_07_get_other_users_note_returns_403(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, body = call(handlers["get"], make_event("GET", user=BOB, note_id=note["noteId"]))
    assert (status, body["error"]["code"]) == (403, "FORBIDDEN")


def test_thesis_table_08_get_missing_note_returns_404(handlers: Handlers) -> None:
    status, body = call(handlers["get"], make_event("GET", note_id=MISSING_ID))
    assert (status, body["error"]["code"]) == (404, "NOT_FOUND")


def test_thesis_table_09_put_own_note_returns_200(handlers: Handlers) -> None:
    note = create_note(handlers)
    time.sleep(0.005)  # make sure the millisecond clock advances
    status, body = call(
        handlers["update"],
        make_event("PUT", note_id=note["noteId"], body={"title": "New", "content": "Changed"}),
    )
    assert status == 200
    updated = body["data"]
    assert (updated["title"], updated["content"], updated["version"]) == ("New", "Changed", 2)
    assert updated["createdAt"] == note["createdAt"]
    assert updated["updatedAt"] > note["updatedAt"]
    _, fetched = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert fetched["data"] == updated


def test_thesis_table_10_put_other_users_note_returns_403(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, _ = call(
        handlers["update"], make_event("PUT", user=BOB, note_id=note["noteId"], body=VALID_BODY)
    )
    assert status == 403


def test_thesis_table_11_put_missing_note_returns_404(handlers: Handlers) -> None:
    status, _ = call(handlers["update"], make_event("PUT", note_id=MISSING_ID, body=VALID_BODY))
    assert status == 404


def test_thesis_table_12_delete_own_note_returns_200(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, body = call(handlers["delete"], make_event("DELETE", note_id=note["noteId"]))
    assert status == 200
    assert body == {"data": {"noteId": note["noteId"], "deleted": True}}
    status, _ = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert status == 404
    _, listing = call(handlers["list"], make_event("GET"))
    assert listing["data"] == []


def test_thesis_table_13_delete_other_users_note_returns_403(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, _ = call(handlers["delete"], make_event("DELETE", user=BOB, note_id=note["noteId"]))
    assert status == 403


# --- Cases the thesis table does not list ---------------------------------------------


def test_delete_missing_note_returns_404(handlers: Handlers) -> None:
    status, _ = call(handlers["delete"], make_event("DELETE", note_id=MISSING_ID))
    assert status == 404


@pytest.mark.parametrize("operation", ["get", "update", "delete"])
def test_invalid_uuid_returns_400(handlers: Handlers, operation: str) -> None:
    method = {"get": "GET", "update": "PUT", "delete": "DELETE"}[operation]
    status, body = call(
        handlers[operation], make_event(method, note_id="not-a-uuid", body=VALID_BODY)
    )
    assert (status, body["error"]["code"]) == (400, "VALIDATION_ERROR")


@pytest.mark.parametrize(
    ("raw_body", "code"),
    [
        ("{not json", "MALFORMED_JSON"),
        ("", "MALFORMED_JSON"),
        (None, "MALFORMED_JSON"),
        ("[]", "MALFORMED_JSON"),
        ("{}", "VALIDATION_ERROR"),
        ('{"title": 7, "content": "c"}', "VALIDATION_ERROR"),
        ('{"title": "t", "content": "c", "extra": true}', "VALIDATION_ERROR"),
    ],
)
def test_bad_bodies_return_400(handlers: Handlers, raw_body: str | None, code: str) -> None:
    for operation, method, note_id in [("create", "POST", None), ("update", "PUT", MISSING_ID)]:
        status, body = call(handlers[operation], make_event(method, note_id=note_id, body=raw_body))
        assert (status, body["error"]["code"]) == (400, code)


def test_invalid_update_leaves_note_unchanged(handlers: Handlers) -> None:
    note = create_note(handlers)
    status, _ = call(
        handlers["update"],
        make_event("PUT", note_id=note["noteId"], body={"title": "", "content": "x"}),
    )
    assert status == 400
    _, fetched = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert fetched["data"] == note


def test_optimistic_locking_conflict_returns_409(handlers: Handlers) -> None:
    note = create_note(handlers)
    first = {"title": "First writer", "content": "a", "version": 1}
    second = {"title": "Second writer", "content": "b", "version": 1}
    assert call(handlers["update"], make_event("PUT", note_id=note["noteId"], body=first))[0] == 200
    status, body = call(handlers["update"], make_event("PUT", note_id=note["noteId"], body=second))
    assert (status, body["error"]["code"]) == (409, "VERSION_CONFLICT")
    _, fetched = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert fetched["data"]["title"] == "First writer"


def test_pagination_walks_all_notes_exactly_once(handlers: Handlers) -> None:
    created = [create_note(handlers, title=f"Note {n:02d}")["noteId"] for n in range(25)]
    seen: list[str] = []
    token: str | None = None
    for _ in range(10):
        query: dict[str, str] = {"limit": "10"}
        if token:
            query["nextToken"] = token
        status, body = call(handlers["list"], make_event("GET", query=query))
        assert status == 200
        assert body["meta"]["count"] == len(body["data"]) <= 10
        seen += [note["noteId"] for note in body["data"]]
        token = body["meta"]["nextToken"]
        if token is None:
            break
    assert sorted(seen) == sorted(created)
    assert len(seen) == len(set(seen)) == 25


def test_list_orders_newest_first(handlers: Handlers) -> None:
    titles = []
    for n in range(3):
        titles.append(create_note(handlers, title=f"Note {n}")["title"])
        time.sleep(0.003)
    _, body = call(handlers["list"], make_event("GET"))
    assert [note["title"] for note in body["data"]] == titles[::-1]


@pytest.mark.parametrize(
    "query",
    [{"limit": "0"}, {"limit": "101"}, {"limit": "abc"}, {"nextToken": "garbage"}, {"sort": "x"}],
)
def test_invalid_list_parameters_return_400(handlers: Handlers, query: dict[str, str]) -> None:
    status, body = call(handlers["list"], make_event("GET", query=query))
    assert status == 400
    assert body["error"]["code"] in {"VALIDATION_ERROR", "INVALID_CURSOR"}


def test_unicode_round_trip(handlers: Handlers) -> None:
    note = create_note(handlers, title="ملاحظة 📝", content="Příliš žluťoučký kůň\n<script>")
    _, body = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert body["data"]["title"] == "ملاحظة 📝"
    assert body["data"]["content"] == "Příliš žluťoučký kůň\n<script>"


def test_deployed_handler_modules_use_runtime_wiring(
    table: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The real entry points (notes_api.handlers.*) work with environment configuration."""
    from local_demo.server import INDEX_NAME, TABLE_NAME
    from notes_api import runtime
    from notes_api.handlers import create_note as create_module
    from notes_api.handlers import delete_note, get_note, list_notes, update_note

    monkeypatch.setenv("NOTES_TABLE_NAME", TABLE_NAME)
    monkeypatch.setenv("NOTES_USER_INDEX_NAME", INDEX_NAME)
    monkeypatch.setenv("CORS_ALLOW_ORIGIN", "https://app.example")
    runtime.reset()
    try:
        response = create_module.handler(make_event("POST", body=VALID_BODY), None)
        assert response["statusCode"] == 201
        assert response["headers"]["Access-Control-Allow-Origin"] == "https://app.example"
        note_id = __import__("json").loads(response["body"])["data"]["noteId"]
        assert call(list_notes.handler, make_event("GET"))[1]["meta"]["count"] == 1
        assert call(get_note.handler, make_event("GET", note_id=note_id))[0] == 200
        assert (
            call(update_note.handler, make_event("PUT", note_id=note_id, body=VALID_BODY))[0] == 200
        )
        assert call(delete_note.handler, make_event("DELETE", note_id=note_id))[0] == 200
    finally:
        runtime.reset()
