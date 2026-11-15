"""Storage-level outcomes. The service layer translates these into API errors."""

from __future__ import annotations


class RepositoryError(Exception):
    """DynamoDB failed (throttling, outage, misconfiguration)."""

    def __init__(self, error_code: str) -> None:
        super().__init__(f"DynamoDB request failed: {error_code}")
        self.error_code = error_code


class NoteNotFound(Exception):
    """No note with the requested id exists."""


class NoteOwnedByAnotherUser(Exception):
    """The note exists but belongs to a different user."""


class NoteVersionMismatch(Exception):
    """The note was modified since the client last read it (optimistic locking)."""


class DuplicateNoteId(Exception):
    """A note with the generated id already exists (astronomically unlikely with UUIDv4)."""
