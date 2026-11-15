"""The Note entity and its two external representations (DynamoDB item, API JSON)."""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any


@dataclass(frozen=True)
class Note:
    note_id: str
    user_id: str
    title: str
    content: str
    created_at: str  # ISO-8601 UTC, e.g. 2026-01-31T12:00:00.000Z
    updated_at: str
    version: int = 1

    @property
    def user_sort_key(self) -> str:
        """Sort key of the byUser index: creation time first, noteId as tie-breaker."""
        return f"{self.created_at}#{self.note_id}"

    def with_changes(self, **changes: Any) -> Note:
        return replace(self, **changes)

    def to_item(self) -> dict[str, Any]:
        """Serialize to the attribute names stored in DynamoDB."""
        return {
            "noteId": self.note_id,
            "userId": self.user_id,
            "userSortKey": self.user_sort_key,
            "title": self.title,
            "content": self.content,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "version": self.version,
        }

    @classmethod
    def from_item(cls, item: dict[str, Any]) -> Note:
        return cls(
            note_id=str(item["noteId"]),
            user_id=str(item["userId"]),
            title=str(item["title"]),
            content=str(item["content"]),
            created_at=str(item["createdAt"]),
            updated_at=str(item["updatedAt"]),
            version=int(item.get("version", 1)),  # DynamoDB returns numbers as Decimal
        )

    def to_api(self) -> dict[str, Any]:
        """Serialize to the public JSON representation (see docs/api/API.md)."""
        return {
            "noteId": self.note_id,
            "userId": self.user_id,
            "title": self.title,
            "content": self.content,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "version": self.version,
        }


@dataclass(frozen=True)
class NotePage:
    """One page of a user's notes plus the cursor for the next page (None on the last page)."""

    notes: list[Note]
    next_cursor: PageCursor | None


@dataclass(frozen=True)
class PageCursor:
    """Position in the byUser index. Deliberately contains no userId: the server always
    combines it with the authenticated caller, so a cursor cannot point at another user."""

    user_sort_key: str
    note_id: str
