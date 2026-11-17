"""Security regression tests: cross-user isolation, ownership, disclosure, log hygiene."""

from __future__ import annotations

import json
import threading
from typing import Any

import pytest

from notes_api.services.notes_service import NotesService
from tests.conftest import (
    ALICE,
    BOB,
    VALID_BODY,
    Handler,
    build_handlers,
    call,
    create_note,
    make_event,
)

Handlers = dict[str, Handler]
SECRET_TITLE = "Alice's secret title"
SECRET_CONTENT = "alice-private-content-7c1f"


@pytest.fixture
def alices_note(handlers: Handlers) -> dict[str, Any]:
    return create_note(handlers, title=SECRET_TITLE, content=SECRET_CONTENT)


@pytest.mark.parametrize(
    ("operation", "method"), [("get", "GET"), ("update", "PUT"), ("delete", "DELETE")]
)
def test_other_user_is_rejected_without_disclosure_or_side_effects(
    handlers: Handlers, alices_note: dict[str, Any], operation: str, method: str
) -> None:
    event = make_event(method, user=BOB, note_id=alices_note["noteId"], body=VALID_BODY)
    response = handlers[operation](event, None)
    assert response["statusCode"] == 403
    assert SECRET_TITLE not in response["body"]
    assert SECRET_CONTENT not in response["body"]
    assert ALICE not in response["body"]  # the owner's identity is not revealed either
    _, fetched = call(handlers["get"], make_event("GET", note_id=alices_note["noteId"]))
    assert fetched["data"] == alices_note  # still there, still unchanged


def test_other_user_with_correct_version_still_cannot_update(
    handlers: Handlers, alices_note: dict[str, Any]
) -> None:
    body = {**VALID_BODY, "version": alices_note["version"]}
    status, _ = call(
        handlers["update"],
        make_event("PUT", user=BOB, note_id=alices_note["noteId"], body=body),
    )
    assert status == 403


def test_listing_never_contains_other_users_notes(
    handlers: Handlers, alices_note: dict[str, Any]
) -> None:
    bobs = create_note(handlers, user=BOB, title="Bob's note")
    response = handlers["list"](make_event("GET", user=BOB), None)
    assert [n["noteId"] for n in json.loads(response["body"])["data"]] == [bobs["noteId"]]
    assert SECRET_CONTENT not in response["body"]
    _, alice_list = call(handlers["list"], make_event("GET", user=ALICE))
    assert [n["noteId"] for n in alice_list["data"]] == [alices_note["noteId"]]


@pytest.mark.parametrize("field", ["userId", "user_id", "owner", "sub", "noteId", "createdAt"])
def test_client_cannot_set_server_controlled_fields(handlers: Handlers, field: str) -> None:
    status, body = call(
        handlers["create"], make_event("POST", user=ALICE, body={**VALID_BODY, field: BOB})
    )
    assert status == 400, body
    _, bob_list = call(handlers["list"], make_event("GET", user=BOB))
    assert bob_list["data"] == []


def test_owner_comes_only_from_token_claims(handlers: Handlers) -> None:
    event = make_event("POST", user=ALICE, body=VALID_BODY, query={"userId": BOB})
    event["headers"]["X-User-Id"] = BOB
    status, body = call(handlers["create"], event)
    assert status == 201
    assert body["data"]["userId"] == ALICE


def test_update_cannot_transfer_ownership(handlers: Handlers, alices_note: dict[str, Any]) -> None:
    status, _ = call(
        handlers["update"],
        make_event("PUT", note_id=alices_note["noteId"], body={**VALID_BODY, "userId": BOB}),
    )
    assert status == 400
    assert (
        call(handlers["get"], make_event("GET", user=BOB, note_id=alices_note["noteId"]))[0] == 403
    )


def test_pagination_token_from_another_user_exposes_nothing(handlers: Handlers) -> None:
    for n in range(3):
        create_note(handlers, user=ALICE, title=f"Alice {n}", content=SECRET_CONTENT)
        create_note(handlers, user=BOB, title=f"Bob {n}")
    _, alice_page = call(handlers["list"], make_event("GET", user=ALICE, query={"limit": "1"}))
    alices_token = alice_page["meta"]["nextToken"]
    assert alices_token

    response = handlers["list"](
        make_event("GET", user=BOB, query={"limit": "50", "nextToken": alices_token}), None
    )
    assert response["statusCode"] in (200, 400)
    assert SECRET_CONTENT not in response["body"]
    if response["statusCode"] == 200:
        assert all(n["userId"] == BOB for n in json.loads(response["body"])["data"])


def test_id_token_and_scope_boundaries(handlers: Handlers, alices_note: dict[str, Any]) -> None:
    id_token_claims = {"sub": ALICE, "token_use": "id", "scope": "notes/read notes/write"}
    assert call(handlers["list"], make_event("GET", claims=id_token_claims))[0] == 401

    read_only = {"sub": ALICE, "token_use": "access", "scope": "openid notes/read"}
    note_id = alices_note["noteId"]
    assert call(handlers["get"], make_event("GET", claims=read_only, note_id=note_id))[0] == 200
    assert call(handlers["create"], make_event("POST", claims=read_only, body=VALID_BODY))[0] == 403
    assert (
        call(
            handlers["update"],
            make_event("PUT", claims=read_only, note_id=note_id, body=VALID_BODY),
        )[0]
        == 403
    )
    assert (
        call(handlers["delete"], make_event("DELETE", claims=read_only, note_id=note_id))[0] == 403
    )
    no_scope = {"sub": ALICE, "token_use": "access"}
    assert call(handlers["list"], make_event("GET", claims=no_scope))[0] == 403


def test_logs_contain_no_note_content_or_credentials(
    handlers: Handlers, capsys: pytest.CaptureFixture[str]
) -> None:
    event = make_event(
        "POST", body={"title": SECRET_TITLE, "content": SECRET_CONTENT},
        headers={"Content-Type": "application/json", "Authorization": "Bearer eyJTOKEN.SECRET.SIG"},
    )  # fmt: skip
    note = call(handlers["create"], event)[1]["data"]
    call(
        handlers["update"],
        make_event(
            "PUT", note_id=note["noteId"], body={"title": SECRET_TITLE, "content": SECRET_CONTENT}
        ),
    )
    call(handlers["get"], make_event("GET", user=BOB, note_id=note["noteId"]))
    call(handlers["create"], make_event("POST", body={"title": SECRET_TITLE, "content": 1}))
    output = capsys.readouterr().out
    assert output.count("request_completed") == 4
    for forbidden in (SECRET_TITLE, SECRET_CONTENT, "eyJTOKEN", "Bearer"):
        assert forbidden not in output


@pytest.mark.parametrize(
    "payload",
    [
        {"title": "'; DROP TABLE notes; --", "content": "x"},
        {"title": "<img src=x onerror=alert(1)>", "content": "<script>alert(1)</script>"},
        {"title": "${jndi:ldap://x}", "content": "{{7*7}} #{7*7} :owner attribute_exists(x)"},
    ],
)
def test_hostile_strings_are_stored_as_inert_data(
    handlers: Handlers, payload: dict[str, str]
) -> None:
    note = create_note(handlers, **payload)
    _, fetched = call(handlers["get"], make_event("GET", note_id=note["noteId"]))
    assert fetched["data"]["title"] == payload["title"]
    assert fetched["data"]["content"] == payload["content"]


def test_error_responses_do_not_leak_internals(
    service: NotesService, monkeypatch: pytest.MonkeyPatch
) -> None:
    def explode(*_: Any, **__: Any) -> None:
        raise RuntimeError("arn:aws:dynamodb:eu-north-1:123456789012:table/secret-table")

    monkeypatch.setattr(service, "list_notes", explode)
    response = build_handlers(lambda: service)["list"](make_event("GET"), None)
    assert response["statusCode"] == 500
    for leaked in ("arn:aws", "123456789012", "RuntimeError", "Traceback", "secret-table"):
        assert leaked not in response["body"]


def test_concurrent_writes_respect_ownership_and_versions(
    handlers: Handlers, alices_note: dict[str, Any]
) -> None:
    """Many simultaneous writers: only the owner's writes land, and with optimistic
    locking exactly one of the competing owner updates wins."""
    note_id = alices_note["noteId"]
    results: list[tuple[str, int]] = []
    lock = threading.Lock()

    def attempt(user: str, index: int) -> None:
        body = {"title": f"{user}-{index}", "content": "x", "version": 1}
        status, _ = call(
            handlers["update"], make_event("PUT", user=user, note_id=note_id, body=body)
        )
        with lock:
            results.append((user, status))

    threads = [
        threading.Thread(target=attempt, args=(user, index))
        for index in range(8)
        for user in (ALICE, BOB)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert {status for user, status in results if user == BOB} == {403}
    alice_statuses = sorted(status for user, status in results if user == ALICE)
    assert alice_statuses == [200] + [409] * 7
    _, final = call(handlers["get"], make_event("GET", note_id=note_id))
    assert final["data"]["version"] == 2
    assert final["data"]["title"].startswith(ALICE)
