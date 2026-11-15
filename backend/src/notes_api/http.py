"""HTTP plumbing shared by all Lambda handlers.

`api_handler` turns a small, pure "operation" function into a Lambda entry point and
centralizes everything cross-cutting: request parsing, the response envelope, error
mapping, CORS/security headers and one structured log line per request.

Event shape: API Gateway REST API, Lambda proxy integration (payload format 1.0).
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from notes_api.errors import AppError, MalformedJsonError, UnsupportedMediaTypeError
from notes_api.logging_utils import get_logger, log_event
from notes_api.security.identity import get_user_id, require_scope
from notes_api.services.notes_service import NotesService

LambdaResponse = dict[str, Any]


@dataclass(frozen=True)
class Request:
    """The parts of the API Gateway event the operations are allowed to see."""

    user_id: str
    path_parameters: dict[str, str]
    query_parameters: dict[str, str]
    body: str | None


@dataclass(frozen=True)
class Result:
    status: int
    data: Any
    meta: dict[str, Any] | None = None


Operation = Callable[[Request, NotesService], Result]


def api_handler(
    operation_name: str,
    required_scope: str,
    operation: Operation,
    service_provider: Callable[[], NotesService],
    *,
    cors_allow_origin: Callable[[], str],
    log_level: Callable[[], str] = lambda: "INFO",
) -> Callable[[dict[str, Any], Any], LambdaResponse]:
    """Wrap `operation` as a Lambda handler `handler(event, context)`."""

    def handler(event: dict[str, Any], context: Any) -> LambdaResponse:
        started = time.perf_counter()
        logger = get_logger(log_level())
        request_id = _request_id(event, context)
        origin = cors_allow_origin()
        user_id: str | None = None
        error_code: str | None = None
        try:
            user_id = get_user_id(event)
            require_scope(event, required_scope)
            request = _build_request(event, user_id)
            result = operation(request, service_provider())
            status = result.status
            body: dict[str, Any] = {"data": result.data}
            if result.meta is not None:
                body["meta"] = result.meta
        except AppError as error:
            status, error_code = error.status, error.code
            body = error_body(error.code, error.message, request_id, error.details)
            if status >= 500:
                log_event(
                    logger,
                    logging.ERROR,
                    "dependency_failure",
                    exc_info=True,
                    requestId=request_id,
                    operation=operation_name,
                    errorCode=error_code,
                )
        except Exception:  # noqa: BLE001 - last line of defense: never leak a stack trace
            status, error_code = 500, "INTERNAL_ERROR"
            body = error_body(error_code, "An unexpected error occurred", request_id)
            log_event(
                logger,
                logging.ERROR,
                "unhandled_exception",
                exc_info=True,
                requestId=request_id,
                operation=operation_name,
            )

        log_event(
            logger,
            logging.INFO if status < 500 else logging.ERROR,
            "request_completed",
            requestId=request_id,
            operation=operation_name,
            httpMethod=event.get("httpMethod"),
            status=status,
            durationMs=round((time.perf_counter() - started) * 1000, 2),
            userId=user_id,
            errorCode=error_code,
            errorCategory=_category(status),
        )
        return json_response(status, body, origin)

    return handler


def error_body(
    code: str,
    message: str,
    request_id: str,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message, "requestId": request_id}
    if details:
        error["details"] = details
    return {"error": error}


def json_response(status: int, body: dict[str, Any], cors_allow_origin: str) -> LambdaResponse:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": cors_allow_origin,
            "Vary": "Origin",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def _category(status: int) -> str | None:
    if status < 400:
        return None
    if status == 503:
        return "dependency"
    return "client" if status < 500 else "server"


def _request_id(event: dict[str, Any], context: Any) -> str:
    request_context = event.get("requestContext")
    if isinstance(request_context, dict) and request_context.get("requestId"):
        return str(request_context["requestId"])
    return str(getattr(context, "aws_request_id", "unknown"))


def _build_request(event: dict[str, Any], user_id: str) -> Request:
    return Request(
        user_id=user_id,
        path_parameters=dict(event.get("pathParameters") or {}),
        query_parameters=dict(event.get("queryStringParameters") or {}),
        body=_decode_body(event),
    )


def _decode_body(event: dict[str, Any]) -> str | None:
    body = event.get("body")
    if body is None:
        return None
    if not isinstance(body, str):
        raise MalformedJsonError("The request body must be a JSON object")
    content_type = _header(event, "content-type")
    if content_type and "json" not in content_type.lower():
        raise UnsupportedMediaTypeError("The Content-Type must be application/json")
    if event.get("isBase64Encoded"):
        try:
            return base64.b64decode(body, validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            raise MalformedJsonError("The request body is not valid UTF-8 JSON") from None
    return body


def _header(event: dict[str, Any], name: str) -> str | None:
    headers = event.get("headers") or {}
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == name:
            return str(value)
    return None
