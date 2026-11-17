"""Lambda entry point for `PUT /notes/{id}` (UpdateNote)."""

from notes_api import operations, runtime
from notes_api.http import api_handler

handler = api_handler(
    "UpdateNote",
    operations.SCOPE_WRITE,
    operations.update_note,
    runtime.get_service,
    cors_allow_origin=runtime.cors_allow_origin,
    log_level=runtime.log_level,
)

runtime.prewarm()  # boto3 set-up during Lambda init, not on the first request
