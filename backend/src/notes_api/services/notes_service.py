"""Business rules for notes: ownership, identifiers, timestamps, error semantics."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import UTC, datetime

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
from notes_api.repositories.notes_repository import NotesRepository

_CREATE_ATTEMPTS = 3
_NOT_FOUND = "Note not found"
_FORBIDDEN = "You do not have access to this note"
_CONFLICT = "The note was modified by another request; reload it and try again"
_UNAVAILABLE = "The service is temporarily unavailable; please retry"


def utc_now_iso() -> str:
    """Current UTC time, millisecond precision, e.g. 2026-01-31T12:00:00.000Z."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def new_note_id() -> str:
    return str(uuid.uuid4())


class NotesService:
    def __init__(
        self,
        repository: NotesRepository,
        clock: Callable[[], str] = utc_now_iso,
        id_factory: Callable[[], str] = new_note_id,
    ) -> None:
        self._repository = repository
        self._clock = clock
        self._id_factory = id_factory

    def create_note(self, user_id: str, title: str, content: str) -> Note:
        """Create a note owned by `user_id`. Id, owner and timestamps are server-generated."""
        now = self._clock()
        for _ in range(_CREATE_ATTEMPTS):
            note = Note(
                note_id=self._id_factory(),
                user_id=user_id,
                title=title,
                content=content,
                created_at=now,
                updated_at=now,
                version=1,
            )
            try:
                self._repository.create(note)
            except DuplicateNoteId:
                continue  # never overwrite an existing note; try a fresh UUID
            except RepositoryError as error:
                raise ServiceUnavailableError(_UNAVAILABLE) from error
            return note
        raise ServiceUnavailableError(_UNAVAILABLE)

    def list_notes(self, user_id: str, limit: int, cursor: PageCursor | None) -> NotePage:
        try:
            return self._repository.list_for_user(user_id, limit, cursor)
        except RepositoryError as error:
            raise ServiceUnavailableError(_UNAVAILABLE) from error

    def get_note(self, user_id: str, note_id: str) -> Note:
        try:
            note = self._repository.get(note_id)
        except RepositoryError as error:
            raise ServiceUnavailableError(_UNAVAILABLE) from error
        if note is None:
            raise NotFoundError(_NOT_FOUND)
        if note.user_id != user_id:
            raise ForbiddenError(_FORBIDDEN)
        return note

    def update_note(
        self,
        user_id: str,
        note_id: str,
        title: str,
        content: str,
        expected_version: int | None = None,
    ) -> Note:
        try:
            return self._repository.update(
                note_id=note_id,
                user_id=user_id,
                title=title,
                content=content,
                updated_at=self._clock(),
                expected_version=expected_version,
            )
        except NoteNotFound:
            raise NotFoundError(_NOT_FOUND) from None
        except NoteOwnedByAnotherUser:
            raise ForbiddenError(_FORBIDDEN) from None
        except NoteVersionMismatch:
            raise VersionConflictError(_CONFLICT) from None
        except RepositoryError as error:
            raise ServiceUnavailableError(_UNAVAILABLE) from error

    def delete_note(self, user_id: str, note_id: str) -> None:
        try:
            self._repository.delete(note_id, user_id)
        except NoteNotFound:
            raise NotFoundError(_NOT_FOUND) from None
        except NoteOwnedByAnotherUser:
            raise ForbiddenError(_FORBIDDEN) from None
        except RepositoryError as error:
            raise ServiceUnavailableError(_UNAVAILABLE) from error
