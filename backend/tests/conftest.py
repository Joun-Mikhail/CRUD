"""Shared fixtures: an in-memory DynamoDB (moto), the real service, and event builders."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Any

import boto3
import pytest
from moto import mock_aws

from local_demo.server import INDEX_NAME, TABLE_NAME, create_table
from notes_api import operations
from notes_api.http import api_handler
from notes_api.repositories.notes_repository import DynamoNotesRepository
from notes_api.services.notes_service import NotesService

ALICE = "user-alice-0001"
BOB = "user-bob-0002"
ORIGIN = "http://localhost:5173"
ALL_SCOPES = "notes/read notes/write"

Handler = Callable[[dict[str, Any], Any], dict[str, Any]]


@pytest.fixture(autouse=True)
def _aws_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fake credentials so no test can ever reach a real AWS account."""
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-central-1")
    monkeypatch.delenv("AWS_SESSION_TOKEN", raising=False)
    monkeypatch.delenv("AWS_PROFILE", raising=False)


@pytest.fixture
def table(_aws_environment: None) -> Iterator[Any]:
    with mock_aws():
        dynamodb = boto3.resource("dynamodb")
        create_table(dynamodb)
        yield dynamodb.Table(TABLE_NAME)


@pytest.fixture
def repository(table: Any) -> DynamoNotesRepository:
    return DynamoNotesRepository(table, INDEX_NAME)


@pytest.fixture
def service(repository: DynamoNotesRepository) -> NotesService:
    return NotesService(repository)


def make_event(
    method: str = "GET",
    *,
    user: str | None = ALICE,
    note_id: str | None = None,
    body: Any = None,
    query: dict[str, str] | None = None,
    claims: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    request_id: str = "req-test-123",
) -> dict[str, Any]:
    """Build an API Gateway REST proxy event (payload format 1.0)."""
    if claims is None and user is not None:
        claims = {"sub": user, "token_use": "access", "scope": ALL_SCOPES}
    raw_body = body if isinstance(body, str) or body is None else json.dumps(body)
    event: dict[str, Any] = {
        "httpMethod": method,
        "headers": headers if headers is not None else {"Content-Type": "application/json"},
        "pathParameters": {"id": note_id} if note_id is not None else None,
        "queryStringParameters": query,
        "body": raw_body,
        "isBase64Encoded": False,
        "requestContext": {"requestId": request_id},
    }
    if claims is not None:
        event["requestContext"]["authorizer"] = {"claims": claims}
    return event


def build_handlers(service_provider: Callable[[], NotesService]) -> dict[str, Handler]:
    specs = {
        "create": ("CreateNote", operations.SCOPE_WRITE, operations.create_note),
        "list": ("ListNotes", operations.SCOPE_READ, operations.list_notes),
        "get": ("GetNote", operations.SCOPE_READ, operations.get_note),
        "update": ("UpdateNote", operations.SCOPE_WRITE, operations.update_note),
        "delete": ("DeleteNote", operations.SCOPE_WRITE, operations.delete_note),
    }
    return {
        key: api_handler(name, scope, op, service_provider, cors_allow_origin=lambda: ORIGIN)
        for key, (name, scope, op) in specs.items()
    }


@pytest.fixture
def handlers(service: NotesService) -> dict[str, Handler]:
    """The five Lambda handlers wired to the moto-backed service."""
    return build_handlers(lambda: service)


def call(handler: Handler, event: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    response = handler(event, None)
    return response["statusCode"], json.loads(response["body"])


VALID_BODY = {"title": "My first note", "content": "Learning serverless architecture"}


def create_note(
    handlers: dict[str, Handler], user: str = ALICE, **overrides: Any
) -> dict[str, Any]:
    status, body = call(
        handlers["create"], make_event("POST", user=user, body={**VALID_BODY, **overrides})
    )
    assert status == 201, body
    return body["data"]
