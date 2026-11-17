"""Lambda entry point for `DELETE /notes/{id}` (DeleteNote)."""

from notes_api import operations, runtime
from notes_api.http import api_handler

handler = api_handler(
    "DeleteNote",
    operations.SCOPE_WRITE,
    operations.delete_note,
    runtime.get_service,
    cors_allow_origin=runtime.cors_allow_origin,
    log_level=runtime.log_level,
)

runtime.prewarm()  # boto3 set-up during Lambda init, not on the first request
