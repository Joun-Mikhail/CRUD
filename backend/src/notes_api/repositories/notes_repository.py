"""DynamoDB data access for notes. The only module that talks to the database.

Table design (see docs/database/DATABASE.md):
* Primary key: noteId (partition key)  -> GetItem / UpdateItem / DeleteItem by id.
* GSI `byUser`: userId (partition key) + userSortKey = "<createdAt>#<noteId>" (sort key)
  -> Query lists exactly one user's notes, newest first. No Scan is ever issued.

Ownership is enforced inside the write itself with a ConditionExpression, so the
"check owner" and "modify" steps are one atomic operation (no race window).
"""

from __future__ import annotations

from typing import Any, Protocol

from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import BotoCoreError, ClientError

from notes_api.models.note import Note, NotePage, PageCursor
from notes_api.repositories.errors import (
    DuplicateNoteId,
    NoteNotFound,
    NoteOwnedByAnotherUser,
    NoteVersionMismatch,
    RepositoryError,
)

_CONDITION_FAILED = "ConditionalCheckFailedException"
_deserializer = TypeDeserializer()


class NotesRepository(Protocol):
    """What the service layer needs from storage (lets tests substitute a fake)."""

    def create(self, note: Note) -> None: ...

    def get(self, note_id: str) -> Note | None: ...

    def list_for_user(self, user_id: str, limit: int, cursor: PageCursor | None) -> NotePage: ...

    def update(
        self,
        note_id: str,
        user_id: str,
        title: str,
        content: str,
        updated_at: str,
        expected_version: int | None,
    ) -> Note: ...

    def delete(self, note_id: str, user_id: str) -> None: ...


class DynamoNotesRepository:
    def __init__(self, table: Any, user_index_name: str) -> None:
        """`table` is a boto3 DynamoDB Table resource."""
        self._table = table
        self._user_index_name = user_index_name

    def create(self, note: Note) -> None:
        try:
            self._table.put_item(
                Item=note.to_item(),
                ConditionExpression="attribute_not_exists(noteId)",
            )
        except ClientError as error:
            if _code(error) == _CONDITION_FAILED:
                raise DuplicateNoteId from error
            raise RepositoryError(_code(error)) from error
        except BotoCoreError as error:
            raise RepositoryError(type(error).__name__) from error

    def get(self, note_id: str) -> Note | None:
        try:
            # Strongly consistent: a note is readable immediately after it is written.
            response = self._table.get_item(Key={"noteId": note_id}, ConsistentRead=True)
        except ClientError as error:
            raise RepositoryError(_code(error)) from error
        except BotoCoreError as error:
            raise RepositoryError(type(error).__name__) from error
        item = response.get("Item")
        return Note.from_item(item) if item else None

    def list_for_user(self, user_id: str, limit: int, cursor: PageCursor | None) -> NotePage:
        query: dict[str, Any] = {
            "IndexName": self._user_index_name,
            "KeyConditionExpression": Key("userId").eq(user_id),
            "ScanIndexForward": False,  # newest first
            "Limit": limit,
        }
        if cursor is not None:
            # The partition value always comes from the authenticated caller.
            query["ExclusiveStartKey"] = {
                "userId": user_id,
                "userSortKey": cursor.user_sort_key,
                "noteId": cursor.note_id,
            }
        try:
            response = self._table.query(**query)
        except ClientError as error:
            raise RepositoryError(_code(error)) from error
        except BotoCoreError as error:
            raise RepositoryError(type(error).__name__) from error

        notes = [Note.from_item(item) for item in response.get("Items", [])]
        last_key = response.get("LastEvaluatedKey")
        next_cursor = (
            PageCursor(user_sort_key=str(last_key["userSortKey"]), note_id=str(last_key["noteId"]))
            if last_key
            else None
        )
        return NotePage(notes=notes, next_cursor=next_cursor)

    def update(
        self,
        note_id: str,
        user_id: str,
        title: str,
        content: str,
        updated_at: str,
        expected_version: int | None,
    ) -> Note:
        condition = "attribute_exists(noteId) AND userId = :owner"
        values: dict[str, Any] = {
            ":owner": user_id,
            ":title": title,
            ":content": content,
            ":updatedAt": updated_at,
            ":one": 1,
        }
        if expected_version is not None:
            condition += " AND version = :expectedVersion"
            values[":expectedVersion"] = expected_version
        try:
            response = self._table.update_item(
                Key={"noteId": note_id},
                UpdateExpression=(
                    "SET title = :title, content = :content, updatedAt = :updatedAt "
                    "ADD version :one"
                ),
                ConditionExpression=condition,
                ExpressionAttributeValues=values,
                ReturnValues="ALL_NEW",
                ReturnValuesOnConditionCheckFailure="ALL_OLD",
            )
        except ClientError as error:
            if _code(error) == _CONDITION_FAILED:
                raise _explain_condition_failure(error, user_id) from error
            raise RepositoryError(_code(error)) from error
        except BotoCoreError as error:
            raise RepositoryError(type(error).__name__) from error
        return Note.from_item(response["Attributes"])

    def delete(self, note_id: str, user_id: str) -> None:
        try:
            self._table.delete_item(
                Key={"noteId": note_id},
                ConditionExpression="attribute_exists(noteId) AND userId = :owner",
                ExpressionAttributeValues={":owner": user_id},
                ReturnValuesOnConditionCheckFailure="ALL_OLD",
            )
        except ClientError as error:
            if _code(error) == _CONDITION_FAILED:
                raise _explain_condition_failure(error, user_id) from error
            raise RepositoryError(_code(error)) from error
        except BotoCoreError as error:
            raise RepositoryError(type(error).__name__) from error


def _code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", "Unknown"))


def _explain_condition_failure(error: ClientError, user_id: str) -> Exception:
    """Work out *why* a conditional write was rejected.

    DynamoDB returns the item as it was at the moment the condition failed
    (ReturnValuesOnConditionCheckFailure=ALL_OLD), in low-level attribute-value form.
    No item -> the note does not exist; different owner -> forbidden; otherwise the
    only remaining clause is the version check.
    """
    raw_item = error.response.get("Item")
    if not raw_item:
        return NoteNotFound()
    owner = _deserializer.deserialize(raw_item["userId"]) if "userId" in raw_item else None
    if owner != user_id:
        return NoteOwnedByAnotherUser()
    return NoteVersionMismatch()
