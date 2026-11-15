"""DynamoDB integration tests (moto): serialization, index usage, conditional writes."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError

from local_demo.server import INDEX_NAME
from notes_api.models.note import Note, PageCursor
from notes_api.repositories.errors import (
    DuplicateNoteId,
    NoteNotFound,
    NoteOwnedByAnotherUser,
    NoteVersionMismatch,
    RepositoryError,
)
from notes_api.repositories.notes_repository import DynamoNotesRepository


def _note(n: int, user: str = "alice", note_id: str | None = None) -> Note:
    stamp = f"2026-01-01T00:00:{n:02d}.000Z"
    return Note(
        note_id=note_id or f"00000000-0000-4000-8000-{n:012d}",
        user_id=user,
        title=f"Note {n}",
        content=f"Content {n} - ünïcödé ✓",
        created_at=stamp,
        updated_at=stamp,
    )


def test_item_serialization(repository: DynamoNotesRepository, table: Any) -> None:
    note = _note(1)
    repository.create(note)
    item = table.get_item(Key={"noteId": note.note_id})["Item"]
    assert item == {
        "noteId": note.note_id,
        "userId": "alice",
        "userSortKey": f"2026-01-01T00:00:01.000Z#{note.note_id}",
        "title": "Note 1",
        "content": "Content 1 - ünïcödé ✓",
        "createdAt": "2026-01-01T00:00:01.000Z",
        "updatedAt": "2026-01-01T00:00:01.000Z",
        "version": 1,
    }
    assert repository.get(note.note_id) == note
    assert repository.get("00000000-0000-4000-8000-999999999999") is None


def test_duplicate_id_is_rejected_and_original_kept(repository: DynamoNotesRepository) -> None:
    original = _note(1)
    repository.create(original)
    with pytest.raises(DuplicateNoteId):
        repository.create(_note(2, user="bob", note_id=original.note_id))
    assert repository.get(original.note_id) == original


def test_list_uses_query_on_index_never_scan(table: Any) -> None:
    spy = MagicMock(wraps=table)
    repository = DynamoNotesRepository(spy, INDEX_NAME)
    repository.create(_note(1))
    repository.list_for_user("alice", 10, None)
    spy.scan.assert_not_called()
    kwargs = spy.query.call_args.kwargs
    assert kwargs["IndexName"] == INDEX_NAME
    assert kwargs["Limit"] == 10
    assert kwargs["ScanIndexForward"] is False


def test_list_is_per_user_newest_first_and_paginated(repository: DynamoNotesRepository) -> None:
    for n in range(1, 8):
        repository.create(_note(n))
    for n in range(8, 11):
        repository.create(_note(n, user="bob"))

    seen: list[str] = []
    cursor: PageCursor | None = None
    pages = 0
    while True:
        page = repository.list_for_user("alice", 3, cursor)
        assert len(page.notes) <= 3
        assert all(note.user_id == "alice" for note in page.notes)
        seen += [note.title for note in page.notes]
        pages += 1
        cursor = page.next_cursor
        if cursor is None:
            break
    assert seen == [f"Note {n}" for n in range(7, 0, -1)]  # deterministic, no gaps/duplicates
    assert pages >= 3
    assert repository.list_for_user("nobody", 3, None).notes == []


def test_cursor_from_another_user_cannot_cross_partitions(
    repository: DynamoNotesRepository,
) -> None:
    for n in range(1, 4):
        repository.create(_note(n))
    for n in range(4, 7):
        repository.create(_note(n, user="bob"))
    bobs_cursor = repository.list_for_user("bob", 1, None).next_cursor
    assert bobs_cursor is not None
    page = repository.list_for_user("alice", 10, bobs_cursor)
    assert all(note.user_id == "alice" for note in page.notes)


def test_update_is_conditional_on_owner_and_version(repository: DynamoNotesRepository) -> None:
    note = _note(1)
    repository.create(note)
    updated = repository.update(note.note_id, "alice", "New", "Body", "2026-02-02T00:00:00.000Z", 1)
    assert (updated.title, updated.content, updated.version) == ("New", "Body", 2)
    assert updated.created_at == note.created_at
    assert updated.updated_at == "2026-02-02T00:00:00.000Z"
    assert repository.get(note.note_id) == updated

    with pytest.raises(NoteVersionMismatch):
        repository.update(note.note_id, "alice", "Stale", "x", "2026-03-03T00:00:00.000Z", 1)
    with pytest.raises(NoteOwnedByAnotherUser):
        repository.update(note.note_id, "bob", "Hacked", "x", "2026-03-03T00:00:00.000Z", None)
    with pytest.raises(NoteOwnedByAnotherUser):  # ownership outranks a correct version guess
        repository.update(note.note_id, "bob", "Hacked", "x", "2026-03-03T00:00:00.000Z", 2)
    with pytest.raises(NoteNotFound):
        repository.update(
            "00000000-0000-4000-8000-999999999999", "alice", "t", "c", "2026-01-01T00:00:00Z", None
        )
    assert repository.get(note.note_id) == updated  # failed writes changed nothing


def test_update_never_creates_a_missing_item(repository: DynamoNotesRepository, table: Any) -> None:
    with pytest.raises(NoteNotFound):
        repository.update(
            "00000000-0000-4000-8000-000000000042", "alice", "t", "c", "2026-01-01T00:00:00Z", None
        )
    assert table.scan()["Count"] == 0  # scan is acceptable in a test assertion


def test_update_without_version_is_last_writer_wins(repository: DynamoNotesRepository) -> None:
    note = _note(1)
    repository.create(note)
    repository.update(note.note_id, "alice", "A", "a", "2026-02-02T00:00:00.000Z", None)
    final = repository.update(note.note_id, "alice", "B", "b", "2026-02-03T00:00:00.000Z", None)
    assert (final.title, final.version) == ("B", 3)


def test_delete_is_conditional_on_owner(repository: DynamoNotesRepository) -> None:
    note = _note(1)
    repository.create(note)
    with pytest.raises(NoteOwnedByAnotherUser):
        repository.delete(note.note_id, "bob")
    assert repository.get(note.note_id) == note
    repository.delete(note.note_id, "alice")
    assert repository.get(note.note_id) is None
    with pytest.raises(NoteNotFound):
        repository.delete(note.note_id, "alice")
    assert repository.list_for_user("alice", 10, None).notes == []


@pytest.mark.parametrize(
    "failure",
    [
        ClientError({"Error": {"Code": "ProvisionedThroughputExceededException"}}, "Op"),
        ClientError({"Error": {"Code": "AccessDeniedException"}}, "Op"),
        EndpointConnectionError(endpoint_url="https://dynamodb.invalid"),
    ],
)
def test_aws_failures_are_wrapped(failure: Exception) -> None:
    broken = MagicMock()
    for method in ("put_item", "get_item", "query", "update_item", "delete_item"):
        getattr(broken, method).side_effect = failure
    repository = DynamoNotesRepository(broken, INDEX_NAME)
    note = _note(1)
    calls = [
        lambda: repository.create(note),
        lambda: repository.get(note.note_id),
        lambda: repository.list_for_user("alice", 5, None),
        lambda: repository.update(note.note_id, "alice", "t", "c", "now", None),
        lambda: repository.delete(note.note_id, "alice"),
    ]
    for invoke in calls:
        with pytest.raises(RepositoryError):
            invoke()
