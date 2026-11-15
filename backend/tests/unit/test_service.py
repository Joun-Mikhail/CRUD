"""Business-logic tests using an in-memory fake repository (no AWS, no moto)."""

from __future__ import annotations

import re
import uuid

import pytest

from notes_api.errors import (
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    VersionConflictError,
)
from notes_api.models.note import Note, NotePage, PageCursor
from notes_api.repositories.errors import (
    DuplicateNoteId,
    NoteNotFound,
    NoteOwnedByAnotherUser,
    NoteVersionMismatch,
    RepositoryError,
)
from notes_api.services.notes_service import NotesService, new_note_id, utc_now_iso


class FakeRepository:
    def __init__(self) -> None:
        self.notes: dict[str, Note] = {}
        self.fail_with: Exception | None = None

    def _maybe_fail(self) -> None:
        if self.fail_with:
            raise self.fail_with

    def create(self, note: Note) -> None:
        self._maybe_fail()
        if note.note_id in self.notes:
            raise DuplicateNoteId
        self.notes[note.note_id] = note

    def get(self, note_id: str) -> Note | None:
        self._maybe_fail()
        return self.notes.get(note_id)

    def list_for_user(self, user_id: str, limit: int, cursor: PageCursor | None) -> NotePage:
        self._maybe_fail()
        mine = sorted(
            (n for n in self.notes.values() if n.user_id == user_id),
            key=lambda n: n.user_sort_key,
            reverse=True,
        )
        return NotePage(notes=mine[:limit], next_cursor=None)

    def update(
        self,
        note_id: str,
        user_id: str,
        title: str,
        content: str,
        updated_at: str,
        expected_version: int | None,
    ) -> Note:
        self._maybe_fail()
        note = self.notes.get(note_id)
        if note is None:
            raise NoteNotFound
        if note.user_id != user_id:
            raise NoteOwnedByAnotherUser
        if expected_version is not None and note.version != expected_version:
            raise NoteVersionMismatch
        updated = note.with_changes(
            title=title, content=content, updated_at=updated_at, version=note.version + 1
        )
        self.notes[note_id] = updated
        return updated

    def delete(self, note_id: str, user_id: str) -> None:
        self._maybe_fail()
        note = self.notes.get(note_id)
        if note is None:
            raise NoteNotFound
        if note.user_id != user_id:
            raise NoteOwnedByAnotherUser
        del self.notes[note_id]


@pytest.fixture
def repo() -> FakeRepository:
    return FakeRepository()


def test_create_generates_id_owner_and_timestamps(repo: FakeRepository) -> None:
    service = NotesService(repo, clock=lambda: "2026-01-01T10:00:00.000Z")
    note = service.create_note("alice", "Title", "Content")
    assert uuid.UUID(note.note_id).version == 4
    assert note.user_id == "alice"
    assert note.created_at == note.updated_at == "2026-01-01T10:00:00.000Z"
    assert note.version == 1
    assert repo.notes[note.note_id] == note


def test_real_clock_and_id_formats() -> None:
    assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", utc_now_iso())
    assert new_note_id() != new_note_id()


def test_create_retries_on_duplicate_id_and_never_overwrites(repo: FakeRepository) -> None:
    ids = iter(["dup", "dup", "fresh"])
    service = NotesService(repo, id_factory=lambda: next(ids))
    first = service.create_note("alice", "one", "1")
    second = service.create_note("bob", "two", "2")
    assert (first.note_id, second.note_id) == ("dup", "fresh")
    assert repo.notes["dup"].user_id == "alice"  # the original was not replaced


def test_create_gives_up_after_repeated_duplicates(repo: FakeRepository) -> None:
    service = NotesService(repo, id_factory=lambda: "same")
    service.create_note("alice", "one", "1")
    with pytest.raises(ServiceUnavailableError):
        service.create_note("alice", "two", "2")


def test_get_distinguishes_missing_from_forbidden(repo: FakeRepository) -> None:
    service = NotesService(repo)
    note = service.create_note("alice", "t", "c")
    assert service.get_note("alice", note.note_id) == note
    with pytest.raises(ForbiddenError):
        service.get_note("bob", note.note_id)
    with pytest.raises(NotFoundError):
        service.get_note("alice", "missing")


def test_update_changes_content_timestamp_and_version(repo: FakeRepository) -> None:
    times = iter(["2026-01-01T10:00:00.000Z", "2026-01-01T11:00:00.000Z"])
    service = NotesService(repo, clock=lambda: next(times))
    note = service.create_note("alice", "t", "c")
    updated = service.update_note("alice", note.note_id, "t2", "c2", expected_version=1)
    assert (updated.title, updated.content, updated.version) == ("t2", "c2", 2)
    assert updated.created_at == note.created_at
    assert updated.updated_at == "2026-01-01T11:00:00.000Z"


def test_update_error_mapping(repo: FakeRepository) -> None:
    service = NotesService(repo)
    note = service.create_note("alice", "t", "c")
    with pytest.raises(ForbiddenError):
        service.update_note("bob", note.note_id, "x", "y")
    with pytest.raises(NotFoundError):
        service.update_note("alice", "missing", "x", "y")
    with pytest.raises(VersionConflictError):
        service.update_note("alice", note.note_id, "x", "y", expected_version=99)
    assert repo.notes[note.note_id] == note  # nothing changed


def test_delete_error_mapping(repo: FakeRepository) -> None:
    service = NotesService(repo)
    note = service.create_note("alice", "t", "c")
    with pytest.raises(ForbiddenError):
        service.delete_note("bob", note.note_id)
    assert note.note_id in repo.notes
    service.delete_note("alice", note.note_id)
    with pytest.raises(NotFoundError):
        service.delete_note("alice", note.note_id)


def test_list_returns_only_callers_notes(repo: FakeRepository) -> None:
    service = NotesService(repo)
    service.create_note("alice", "a", "1")
    service.create_note("bob", "b", "2")
    page = service.list_notes("alice", 20, None)
    assert [n.title for n in page.notes] == ["a"]
    assert service.list_notes("carol", 20, None).notes == []


@pytest.mark.parametrize("operation", ["create", "list", "get", "update", "delete"])
def test_database_failures_become_503(repo: FakeRepository, operation: str) -> None:
    service = NotesService(repo)
    note = service.create_note("alice", "t", "c")
    repo.fail_with = RepositoryError("ProvisionedThroughputExceededException")
    calls = {
        "create": lambda: service.create_note("alice", "t", "c"),
        "list": lambda: service.list_notes("alice", 20, None),
        "get": lambda: service.get_note("alice", note.note_id),
        "update": lambda: service.update_note("alice", note.note_id, "t", "c"),
        "delete": lambda: service.delete_note("alice", note.note_id),
    }
    with pytest.raises(ServiceUnavailableError) as caught:
        calls[operation]()
    assert "Provisioned" not in caught.value.message  # no internal detail leaks to clients
