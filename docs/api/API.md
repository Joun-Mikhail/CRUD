# API reference

Machine-readable version: [`openapi.yaml`](openapi.yaml). Implementation: `backend/src/notes_api/`.

Base URL
- AWS: `https://<api-id>.execute-api.eu-central-1.amazonaws.com/<stage>` (stack output `ApiBaseUrl`)
- Local Demo: `http://127.0.0.1:8787`

## Authentication

Every endpoint requires `Authorization: Bearer <access token>`.

| | AWS mode | Local Demo |
|---|---|---|
| Credential | Cognito **access token** (JWT, RS256) obtained with Authorization Code + PKCE | `Authorization: Demo alice` (or `bob`, `carol`) — simulated, **not** a security control |
| Verified by | API Gateway Cognito authorizer (signature, issuer, expiry, scope) | `backend/local_demo/server.py` |
| Scopes | `notes/read` for GET, `notes/write` for POST/PUT/DELETE | both always granted |

An ID token is not accepted. The caller's identity is the token's `sub` claim; it is never read from the body, query string or custom headers.

## Endpoints (exactly the five required by the thesis)

| Method | Path | Lambda | Scope | Success |
|---|---|---|---|---|
| POST | `/notes` | CreateNote | `notes/write` | 201 Created |
| GET | `/notes` | ListNotes | `notes/read` | 200 OK |
| GET | `/notes/{id}` | GetNote | `notes/read` | 200 OK |
| PUT | `/notes/{id}` | UpdateNote | `notes/write` | 200 OK |
| DELETE | `/notes/{id}` | DeleteNote | `notes/write` | 200 OK |

## Response convention

Success — one resource:
```json
{ "data": { "noteId": "0b7f…", "userId": "c3a4…", "title": "My first note",
            "content": "Learning serverless architecture",
            "createdAt": "2026-01-31T12:00:00.000Z", "updatedAt": "2026-01-31T12:00:00.000Z", "version": 1 } }
```
Success — list: `{ "data": [Note, …], "meta": { "count": 2, "limit": 20, "nextToken": null } }`

Success — delete: `{ "data": { "noteId": "0b7f…", "deleted": true } }`

Error (always this shape, from Lambda *and* from API Gateway):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The title field is required",
             "requestId": "c6af9ac6-…", "details": [ { "field": "title", "issue": "is required" } ] } }
```
`details` is present only for validation errors. `requestId` is the API Gateway request id — search for it in CloudWatch Logs.

All Lambda responses carry `Content-Type: application/json`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Access-Control-Allow-Origin: <configured origin>`.

## Note fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `noteId` | string (UUID v4) | server | |
| `userId` | string | server | the `sub` claim of the creator; cannot be changed |
| `title` | string | client | trimmed; 1–200 characters; no control characters |
| `content` | string | client | stored as sent; 0–20,000 characters; no NUL |
| `createdAt`, `updatedAt` | string | server | ISO-8601 UTC with milliseconds |
| `version` | integer | server | starts at 1, +1 on every update |

## Validation rules

- Body must be a JSON **object** with `Content-Type: application/json`; max 128 KiB (413 above; API Gateway itself rejects bodies over 10 MB).
- `POST`: exactly `title` and `content`. `PUT`: `title`, `content` and optionally `version` (positive integer). PUT is a **full replacement** — both fields are required.
- **Unknown fields are rejected** (400). This is what stops a client sending `userId`.
- No implicit conversion: `"title": 123` is a 400, not `"123"`.
- All problems are reported together in `details`.
- `{id}` must be a UUID (400 otherwise). Upper-case ids are lower-cased.
- `GET /notes`: `limit` integer 1–100 (default 20); `nextToken` opaque string from the previous page; other query parameters are rejected.

## Pagination

`GET /notes` returns notes **newest first** (by `createdAt`, ties broken by `noteId`). If `meta.nextToken` is not `null`, pass it as `?nextToken=` to get the next page; `null` means the last page was reached. A page may be shorter than `limit`. The token encodes a position only — it contains no user id and is always combined with the caller's identity on the server, so a token taken from another user cannot expose their notes. A malformed token is `400 INVALID_CURSOR`.

Listing reads a global secondary index, which is *eventually consistent*: a note created a few milliseconds ago may be missing from an immediate list call (normally well under a second). `GET /notes/{id}` is strongly consistent.

## Optimistic locking

Send the `version` you last read with `PUT`. If the stored version differs, nothing is written and the API answers `409 VERSION_CONFLICT`. Without `version` the update is last-writer-wins.

## Status codes

| Status | Code | When | Produced by |
|---|---|---|---|
| 200 | — | read, update, delete succeeded | Lambda |
| 201 | — | note created | Lambda |
| 400 | `VALIDATION_ERROR`, `MALFORMED_JSON`, `INVALID_CURSOR` | bad input | Lambda |
| 401 | `UNAUTHORIZED` | token missing, malformed, expired, wrong signature | API Gateway (Lambda repeats the check as defence in depth) |
| 403 | `FORBIDDEN` | note exists but belongs to another user; token lacks the scope | Lambda / API Gateway |
| 404 | `NOT_FOUND` | no note with this id; unknown route | Lambda / API Gateway |
| 405 | `METHOD_NOT_ALLOWED` | Local Demo only. In AWS an unsupported method is an unknown route and is answered 404 `NOT_FOUND` (API Gateway reports it as "missing authentication token") | — |
| 409 | `VERSION_CONFLICT` | stale `version` on PUT | Lambda |
| 413 | `PAYLOAD_TOO_LARGE` | body over 128 KiB | Lambda / API Gateway |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type is not JSON | Lambda |
| 429 | `THROTTLED` | stage throttle exceeded (default 10 req/s, burst 20) | API Gateway |
| 500 | `INTERNAL_ERROR` | unexpected failure; no details are exposed | Lambda / API Gateway |
| 503 | `SERVICE_UNAVAILABLE` | DynamoDB failed or throttled; safe to retry | Lambda |

### Two deliberate, thesis-driven choices

- **403 for someone else's note.** The thesis states: "the API must return HTTP 403 … even if the resource exists". The trade-off: 403 vs 404 lets an authenticated user learn that a given UUID exists. Many APIs return 404 for both to hide existence. The leak here is small (ids are random 122-bit UUIDs that cannot be guessed, and no content or owner is revealed) and the assignment is explicit, so 403 is kept. Switching is a one-line change in `NotesService.get_note`.
- **200 for DELETE.** The thesis requires 200. `204 No Content` is the other conventional choice; 200 lets the API keep its uniform `{"data": …}` envelope.

## curl examples

```bash
API=http://127.0.0.1:8787            # Local Demo
AUTH="Authorization: Demo alice"     # AWS: AUTH="Authorization: Bearer $ACCESS_TOKEN"

curl -s -X POST "$API/notes" -H "$AUTH" -H 'Content-Type: application/json' \
     -d '{"title":"My first note","content":"Learning serverless architecture"}'
curl -s "$API/notes?limit=10" -H "$AUTH"
curl -s "$API/notes/$NOTE_ID" -H "$AUTH"
curl -s -X PUT "$API/notes/$NOTE_ID" -H "$AUTH" -H 'Content-Type: application/json' \
     -d '{"title":"Updated","content":"New text","version":1}'
curl -s -X DELETE "$API/notes/$NOTE_ID" -H "$AUTH"
curl -s -i "$API/notes"              # no credentials -> 401
```

## Lambda event shape

API Gateway REST API, Lambda proxy integration (payload format 1.0). The handlers read only:

```json
{ "httpMethod": "PUT",
  "headers": { "Content-Type": "application/json" },
  "pathParameters": { "id": "0b7f…" },
  "queryStringParameters": null,
  "body": "{\"title\":\"…\",\"content\":\"…\"}",
  "isBase64Encoded": false,
  "requestContext": { "requestId": "c6af…",
                      "authorizer": { "claims": { "sub": "c3a4…", "token_use": "access", "scope": "notes/read notes/write" } } } }
```
and must return `{ "statusCode": 200, "headers": {…}, "body": "<JSON string>" }`. See `backend/src/notes_api/http.py`.
