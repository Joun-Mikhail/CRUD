"""The five note operations as pure functions: (Request, NotesService) -> Result.

They contain no AWS or HTTP-envelope code, which keeps them trivial to unit test.
"""

from __future__ import annotations

from notes_api.errors import ValidationError
from notes_api.http import Request, Result
from notes_api.pagination import decode_cursor, encode_cursor
from notes_api.services.notes_service import NotesService
from notes_api.validation.notes import (
    parse_json_object,
    validate_note_id,
    validate_note_input,
    validate_page_size,
)

SCOPE_READ = "notes/read"
SCOPE_WRITE = "notes/write"


def create_note(request: Request, service: NotesService) -> Result:
    data = validate_note_input(parse_json_object(request.body), allow_version=False)
    note = service.create_note(request.user_id, data.title, data.content)
    return Result(201, note.to_api())


def list_notes(request: Request, service: NotesService) -> Result:
    unknown = sorted(set(request.query_parameters) - {"limit", "nextToken"})
    if unknown:
        raise ValidationError(
            f"Unknown query parameter: {unknown[0]}",
            [{"field": name, "issue": "unknown query parameter"} for name in unknown],
        )
    limit = validate_page_size(request.query_parameters.get("limit"))
    token = request.query_parameters.get("nextToken")
    cursor = decode_cursor(token) if token is not None else None
    page = service.list_notes(request.user_id, limit, cursor)
    return Result(
        200,
        [note.to_api() for note in page.notes],
        meta={
            "count": len(page.notes),
            "limit": limit,
            "nextToken": encode_cursor(page.next_cursor) if page.next_cursor else None,
        },
    )


def get_note(request: Request, service: NotesService) -> Result:
    note_id = validate_note_id(request.path_parameters.get("id"))
    return Result(200, service.get_note(request.user_id, note_id).to_api())


def update_note(request: Request, service: NotesService) -> Result:
    note_id = validate_note_id(request.path_parameters.get("id"))
    data = validate_note_input(parse_json_object(request.body), allow_version=True)
    note = service.update_note(
        request.user_id, note_id, data.title, data.content, data.expected_version
    )
    return Result(200, note.to_api())


def delete_note(request: Request, service: NotesService) -> Result:
    note_id = validate_note_id(request.path_parameters.get("id"))
    service.delete_note(request.user_id, note_id)
    return Result(200, {"noteId": note_id, "deleted": True})
