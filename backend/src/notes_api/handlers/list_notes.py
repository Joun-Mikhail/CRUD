"""Lambda entry point for `GET /notes` (ListNotes)."""

from notes_api import operations, runtime
from notes_api.http import api_handler

handler = api_handler(
    "ListNotes",
    operations.SCOPE_READ,
    operations.list_notes,
    runtime.get_service,
    cors_allow_origin=runtime.cors_allow_origin,
    log_level=runtime.log_level,
)
