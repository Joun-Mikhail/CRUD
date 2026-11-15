# Database design (DynamoDB)

Defined in `infrastructure/template.yaml` (`NotesTable`); used only by `backend/src/notes_api/repositories/notes_repository.py`. The Local Demo and the tests create the identical schema in `moto` (`backend/local_demo/server.py::create_table`).

## Schema

Table `<stack>-notes`, billing mode on-demand (`PAY_PER_REQUEST`), encryption at rest enabled.

| Attribute | Type | Role |
|---|---|---|
| `noteId` | S | **Partition key** of the table (UUID v4) |
| `userId` | S | Owner (Cognito `sub`). Partition key of index `byUser` |
| `userSortKey` | S | `"<createdAt>#<noteId>"`. Sort key of index `byUser` |
| `title`, `content` | S | Note data |
| `createdAt`, `updatedAt` | S | ISO-8601 UTC, millisecond precision (sorts correctly as text) |
| `version` | N | Optimistic-locking counter |

Global secondary index **`byUser`**: partition `userId`, sort `userSortKey`, projection `ALL`.

Example item:
```json
{ "noteId": "0b7f2c1e-…", "userId": "c3a4…", "userSortKey": "2026-01-31T12:00:00.000Z#0b7f2c1e-…",
  "title": "My first note", "content": "…", "createdAt": "2026-01-31T12:00:00.000Z",
  "updatedAt": "2026-01-31T12:00:00.000Z", "version": 1 }
```

## Access patterns

| # | Pattern | Call | Cost |
|---|---|---|---|
| 1 | Create a note | `PutItem`, condition `attribute_not_exists(noteId)` | 1 write (+1 for the index) |
| 2 | Get a note by id | `GetItem`, `ConsistentRead=True` | 1 strongly consistent read |
| 3 | List one user's notes, newest first, paginated | `Query` on `byUser`, `ScanIndexForward=False`, `Limit` | reads only that user's items |
| 4 | Update own note | `UpdateItem`, condition on existence + owner (+ version) | 1 write (index not rewritten: its keys do not change) |
| 5 | Delete own note | `DeleteItem`, condition on existence + owner | 1 write (+1 index) |

**`Scan` is never used.** A test asserts it (`test_list_uses_query_on_index_never_scan`), and the Lambda roles do not even have the permission.

## Why this key design

The semestral report used `noteId` as the only key and listed a user's notes by "application-level filtering" — i.e. reading the whole table (`Scan`) and discarding other users' rows. That costs and slows down in proportion to *everyone's* data, and it puts other users' notes in the function's memory. The report itself named this as the main scalability weakness.

Two ways to fix it were evaluated:

| | A. `noteId` PK + GSI `byUser` (chosen) | B. composite key `userId` (PK) + `noteId` (SK) |
|---|---|---|
| Get by id | 1 `GetItem` | 1 `GetItem` — but only finds the caller's own notes |
| "Exists but belongs to someone else → **403**" (thesis requirement) | Natural: the item is found, the owner differs | Not possible without a second lookup: another user's note is simply "not found" (→ 404) |
| List | `Query` on GSI, eventually consistent | `Query` on table, can be strongly consistent |
| Write cost | index adds ~1 extra write on create/delete | no extra write |
| Keeps the report's `noteId` partition key | yes | no |

B is slightly cheaper and gives consistent listing; it is what one would choose if 404-for-everything were acceptable. A is chosen because the official requirements demand the 403/404 distinction and it preserves the documented primary key. (Decision record: `docs/decisions/0002-dynamodb-key-design.md`.)

## Ownership and conditional writes

Update and delete carry the ownership rule *inside the write*:

```
ConditionExpression: attribute_exists(noteId) AND userId = :owner [AND version = :expectedVersion]
ReturnValuesOnConditionCheckFailure: ALL_OLD
```
DynamoDB evaluates the condition and performs the write as one atomic step. If the condition fails, the old item (if any) is returned with the error, and the repository decides: no item → not found (404); other owner → forbidden (403); otherwise the version differed → conflict (409). A "read, check in Python, then write" sequence would leave a window between check and write; this does not.

Create uses `attribute_not_exists(noteId)` so a (practically impossible) UUID collision can never overwrite a note; the service retries with a new UUID.

## Pagination

`Query` returns `LastEvaluatedKey` when more items remain. The API turns it into an opaque `nextToken` = base64url of `{"k": userSortKey, "n": noteId}` (`pagination.py`). On the next request the repository rebuilds `ExclusiveStartKey` from the token **plus the authenticated `userId`**. The token therefore cannot address another user's partition; tampering yields either a 400 or simply a different position in the caller's own notes. Order is deterministic: `createdAt` descending, `noteId` as tie-breaker.

## Consistency

- Table reads/writes by `noteId`: strongly consistent (`ConsistentRead=True` on get; conditional writes always see the latest item).
- The GSI is updated asynchronously — **eventually consistent**, typically within milliseconds. A list request immediately after a create may not include the new note yet. The frontend avoids the visible effect by inserting the created note into its local list from the POST response.

## Concurrency

`version` starts at 1 and is incremented atomically (`ADD version :one`). A client that sends the version it read gets `409` if someone updated the note in between (lost-update protection). Verified with 16 concurrent writers in `tests/security/test_isolation.py::test_concurrent_writes_respect_ownership_and_versions`: exactly one owner update wins, all non-owner writes get 403.

## Capacity, scalability, limits

- On-demand capacity: no capacity planning, scales with traffic, pay per request; suitable for a spiky/low-traffic thesis project. Provisioned capacity with auto scaling becomes cheaper only at steady high throughput.
- Hot partitions: table partitions by random `noteId` (ideal distribution). The index partitions by `userId`; a single user with an enormous number of notes is the only hot-key scenario, bounded per partition at roughly 1,000 writes/s and 3,000 reads/s.
- Item size limit 400 KB; the largest possible note (20,000 characters, up to 4 bytes each, + title) is ~81 KB.
- `Stage=prod` enables point-in-time recovery and retains the table on stack deletion; `dev`/`test` delete it with the stack.

## IAM

Each function may perform exactly one action: CreateNote `dynamodb:PutItem`, GetNote `GetItem`, UpdateNote `UpdateItem`, DeleteNote `DeleteItem` on the table ARN; ListNotes `dynamodb:Query` on the **index ARN only**.
