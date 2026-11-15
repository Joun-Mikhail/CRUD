"""Local Demo server - runs the REAL Lambda handlers on your machine, without AWS.

What is real:  every line of backend code (handlers, validation, service, DynamoDB
               repository). DynamoDB itself is emulated in memory by `moto`.
What is fake:  authentication. There is no Cognito and no JWT here. A request is
               "signed in" by sending `Authorization: Demo <name>` where <name> is one of
               the demo identities below. This stands in for API Gateway's Cognito
               authorizer and is NOT a security control - never deploy this server.

Data lives in memory and disappears when the server stops.

Usage:  python -m local_demo.server [--port 8787] [--seed]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import uuid
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qsl, urlsplit

DEMO_USERS = {
    "alice": {"sub": "demo-user-alice", "email": "alice@demo.local"},
    "bob": {"sub": "demo-user-bob", "email": "bob@demo.local"},
    "carol": {"sub": "demo-user-carol", "email": "carol@demo.local"},
}
TABLE_NAME = "local-demo-notes"
INDEX_NAME = "byUser"
ALLOWED_ORIGIN_PATTERN = re.compile(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$")
_NOTE_PATH = re.compile(r"^/notes/([^/]+)$")
_MAX_REQUEST_BYTES = 1024 * 1024

LambdaHandler = Callable[[dict[str, Any], Any], dict[str, Any]]


def create_table(dynamodb: Any) -> None:
    """Create the same table + index that infrastructure/template.yaml defines."""
    dynamodb.create_table(
        TableName=TABLE_NAME,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "noteId", "AttributeType": "S"},
            {"AttributeName": "userId", "AttributeType": "S"},
            {"AttributeName": "userSortKey", "AttributeType": "S"},
        ],
        KeySchema=[{"AttributeName": "noteId", "KeyType": "HASH"}],
        GlobalSecondaryIndexes=[
            {
                "IndexName": INDEX_NAME,
                "KeySchema": [
                    {"AttributeName": "userId", "KeyType": "HASH"},
                    {"AttributeName": "userSortKey", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    )


def configure_environment() -> None:
    """Point the backend at the in-memory table. Fake credentials keep boto3 offline."""
    os.environ.update(
        {
            "NOTES_TABLE_NAME": TABLE_NAME,
            "NOTES_USER_INDEX_NAME": INDEX_NAME,
            "AWS_DEFAULT_REGION": "eu-central-1",
            "AWS_ACCESS_KEY_ID": "local-demo",
            "AWS_SECRET_ACCESS_KEY": "local-demo",  # noqa: S105 - placeholder for moto
        }
    )
    os.environ.pop("AWS_SESSION_TOKEN", None)
    os.environ.pop("AWS_PROFILE", None)


def load_routes() -> dict[tuple[str, bool], LambdaHandler]:
    """(HTTP method, has note id) -> Lambda handler; mirrors the API Gateway routes."""
    from notes_api.handlers import create_note, delete_note, get_note, list_notes, update_note

    return {
        ("POST", False): create_note.handler,
        ("GET", False): list_notes.handler,
        ("GET", True): get_note.handler,
        ("PUT", True): update_note.handler,
        ("DELETE", True): delete_note.handler,
    }


class DemoRequestHandler(BaseHTTPRequestHandler):
    routes: dict[tuple[str, bool], LambdaHandler] = {}
    reset_data: Callable[[], None] = staticmethod(lambda: None)
    server_version = "ServerlessNotesLocalDemo/1.0"

    def do_OPTIONS(self) -> None:  # noqa: N802 - name required by http.server
        self._send(204, None)

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch("POST")

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch("PUT")

    def do_DELETE(self) -> None:  # noqa: N802
        self._dispatch("DELETE")

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch("PATCH")

    def _dispatch(self, method: str) -> None:
        url = urlsplit(self.path)
        request_id = str(uuid.uuid4())

        if url.path == "/health" and method == "GET":
            self._send(200, {"data": {"status": "ok", "mode": "local-demo"}})
            return
        if url.path == "/__demo/reset" and method == "POST":
            type(self).reset_data()
            self._send(200, {"data": {"reset": True}})
            return

        note_match = _NOTE_PATH.match(url.path)
        if url.path != "/notes" and not note_match:
            self._send_error(404, "NOT_FOUND", "No such route", request_id)
            return
        handler = self.routes.get((method, bool(note_match)))
        if handler is None:
            self._send_error(405, "METHOD_NOT_ALLOWED", "Method not allowed", request_id)
            return

        # Stand-in for the API Gateway Cognito authorizer (see module docstring).
        claims = self._demo_claims()
        if claims is None:
            self._send_error(401, "UNAUTHORIZED", "Authentication is required", request_id)
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length > _MAX_REQUEST_BYTES:
            self._send_error(413, "PAYLOAD_TOO_LARGE", "Request body too large", request_id)
            return
        body = self.rfile.read(length).decode("utf-8", errors="replace") if length else None

        event = {
            "httpMethod": method,
            "path": url.path,
            "headers": dict(self.headers.items()),
            "pathParameters": {"id": note_match.group(1)} if note_match else None,
            "queryStringParameters": dict(parse_qsl(url.query, keep_blank_values=True)) or None,
            "body": body,
            "isBase64Encoded": False,
            "requestContext": {"requestId": request_id, "authorizer": {"claims": claims}},
        }
        response = handler(event, None)
        self._send(int(response["statusCode"]), json.loads(response["body"]))

    def _demo_claims(self) -> dict[str, str] | None:
        scheme, _, name = (self.headers.get("Authorization") or "").partition(" ")
        user = DEMO_USERS.get(name.strip().lower()) if scheme == "Demo" else None
        if user is None:
            return None
        return {**user, "token_use": "access", "scope": "notes/read notes/write"}

    def _send_error(self, status: int, code: str, message: str, request_id: str) -> None:
        self._send(status, {"error": {"code": code, "message": message, "requestId": request_id}})

    def _send(self, status: int, payload: dict[str, Any] | None) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode() if payload is not None else b""
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin and ALLOWED_ORIGIN_PATTERN.match(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
        self.send_header("X-Demo-Mode", "local-demo")
        self.send_header("Cache-Control", "no-store")
        if payload is not None:
            self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        try:
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the browser cancelled the request (e.g. navigated away); nothing to send

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        """Silence http.server's access log; the backend already logs each request as JSON."""


def seed(dynamodb: Any) -> None:
    """Insert a few example notes so the demo is not empty."""
    from notes_api.repositories.notes_repository import DynamoNotesRepository
    from notes_api.services.notes_service import NotesService

    service = NotesService(DynamoNotesRepository(dynamodb.Table(TABLE_NAME), INDEX_NAME))
    alice, bob = DEMO_USERS["alice"]["sub"], DEMO_USERS["bob"]["sub"]
    service.create_note(alice, "Welcome to Serverless Notes", "This note lives in memory only.")
    service.create_note(alice, "Thesis checklist", "- CRUD\n- Authentication\n- Evaluation")
    service.create_note(bob, "Bob's private note", "Alice must never be able to read this.")


def build_server(port: int, *, with_seed: bool = False, host: str = "127.0.0.1") -> Any:
    """Start the in-memory DynamoDB and return (server, stop). Caller runs serve_forever()."""
    import boto3
    from moto import mock_aws

    from notes_api import runtime

    configure_environment()
    mock = mock_aws()
    mock.start()
    dynamodb = boto3.resource("dynamodb")

    def reset_data() -> None:
        dynamodb.Table(TABLE_NAME).delete()
        create_table(dynamodb)
        if with_seed:
            seed(dynamodb)

    create_table(dynamodb)
    if with_seed:
        seed(dynamodb)
    runtime.reset()

    DemoRequestHandler.routes = load_routes()
    DemoRequestHandler.reset_data = staticmethod(reset_data)
    server = ThreadingHTTPServer((host, port), DemoRequestHandler)

    def stop() -> None:
        server.server_close()
        mock.stop()
        runtime.reset()

    return server, stop


def main() -> None:
    parser = argparse.ArgumentParser(description="Serverless Notes - Local Demo backend")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--seed", action="store_true", help="start with example notes")
    args = parser.parse_args()

    server, stop = build_server(args.port, with_seed=args.seed)
    users = ", ".join(DEMO_USERS)
    print(f"LOCAL DEMO backend on http://127.0.0.1:{args.port}  (no AWS, no Cognito)")
    print(f"Demo identities: {users}  ->  send header  Authorization: Demo <name>")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop()


if __name__ == "__main__":
    main()
