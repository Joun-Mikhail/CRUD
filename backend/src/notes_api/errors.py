"""Application errors. Each one maps to exactly one HTTP status and stable error code."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """Base class for errors that are safe to describe to the API client."""

    status: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class ValidationError(AppError):
    status = 400
    code = "VALIDATION_ERROR"


class MalformedJsonError(AppError):
    status = 400
    code = "MALFORMED_JSON"


class InvalidCursorError(AppError):
    status = 400
    code = "INVALID_CURSOR"


class UnauthenticatedError(AppError):
    status = 401
    code = "UNAUTHORIZED"


class ForbiddenError(AppError):
    status = 403
    code = "FORBIDDEN"


class NotFoundError(AppError):
    status = 404
    code = "NOT_FOUND"


class VersionConflictError(AppError):
    status = 409
    code = "VERSION_CONFLICT"


class PayloadTooLargeError(AppError):
    status = 413
    code = "PAYLOAD_TOO_LARGE"


class UnsupportedMediaTypeError(AppError):
    status = 415
    code = "UNSUPPORTED_MEDIA_TYPE"


class ServiceUnavailableError(AppError):
    """A dependency (DynamoDB) failed or throttled; the client may retry."""

    status = 503
    code = "SERVICE_UNAVAILABLE"
