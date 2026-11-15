"""Lambda entry point for `GET /notes/{id}` (GetNote)."""

from notes_api import operations, runtime
from notes_api.http import api_handler

handler = api_handler(
    "GetNote",
    operations.SCOPE_READ,
    operations.get_note,
    runtime.get_service,
    cors_allow_origin=runtime.cors_allow_origin,
    log_level=runtime.log_level,
)
