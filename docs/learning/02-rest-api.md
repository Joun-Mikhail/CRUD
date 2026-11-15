# Lesson 2 — What a REST API is

## In one minute
An API is a contract that lets programs talk. A REST API uses plain HTTP: the **URL names a thing** (`/notes/123`), the **method says what to do** (GET, POST, PUT, DELETE), the **status code says how it went** (200, 404…), and the data travels as **JSON**. Each request carries everything needed to process it — the server remembers nothing between requests (**stateless**).

## The simple explanation
A restaurant: the menu is the API. You do not walk into the kitchen; you order by the menu's names and get either your dish or a clear "sorry, we're out". 

| Idea | Rule | In this project |
|---|---|---|
| Resource | nouns in URLs, never verbs | `/notes`, `/notes/{id}` — not `/createNote` |
| Method | the verb | POST = create, GET = read, PUT = replace, DELETE = delete |
| Status code | outcome class | 2xx success, 4xx *you* made a mistake, 5xx *we* failed |
| Representation | body format | JSON |
| Stateless | no session on the server | every request carries the token |

Status codes used here: **201** created · **200** OK · **400** bad input · **401** not authenticated · **403** authenticated but not allowed · **404** does not exist · **409** conflict (stale version) · **429** too many requests · **500** bug · **503** dependency down.

401 vs 403: 401 = "I don't know who you are". 403 = "I know who you are, and the answer is no".

## In this repository
One request and its response:
```http
POST /notes HTTP/1.1
Authorization: Bearer <access token>
Content-Type: application/json

{"title": "My first note", "content": "Learning serverless architecture"}
```
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"data": {"noteId": "0b7f…", "userId": "c3a4…", "title": "My first note",
          "content": "Learning serverless architecture",
          "createdAt": "2026-01-31T12:00:00.000Z", "updatedAt": "2026-01-31T12:00:00.000Z", "version": 1}}
```
Success is always wrapped in `data`; failure is always wrapped in `error`. The wrapper is built in one place, `backend/src/notes_api/http.py`:
```python
def error_body(code, message, request_id, details=None):
    error = {"code": code, "message": message, "requestId": request_id}
    if details:
        error["details"] = details
    return {"error": error}
```
The operation itself is tiny (`operations.py`):
```python
def create_note(request: Request, service: NotesService) -> Result:
    data = validate_note_input(parse_json_object(request.body), allow_version=False)
    note = service.create_note(request.user_id, data.title, data.content)
    return Result(201, note.to_api())
```
Notice what the client does **not** send: `noteId`, `userId`, timestamps. The server decides those. A body containing `userId` is rejected with 400.

PUT replaces the whole note, so it needs both `title` and `content`. (PATCH would mean "change only some fields"; it is not in the thesis endpoint list, so it does not exist here.)

## Important source files
`docs/api/API.md` · `docs/api/openapi.yaml` · `backend/src/notes_api/operations.py` · `backend/src/notes_api/errors.py` (each error class = one status + one code)

## بالعربي (مصري)
- الـ **API** زي المنيو في المطعم: إنت بتطلب بالاسم المكتوب وما بتدخلش المطبخ. الـ URL هو اسم الحاجة (`/notes`)، والـ method هو الفعل (GET هات، POST اعمل جديد، PUT بدّل، DELETE امسح).
- **401** يعني "أنا مش عارفك" (مفيش token أو الـ token بايظ). **403** يعني "أنا عارفك، بس ده مش بتاعك". **404** يعني "الحاجة دي مش موجودة أصلًا".
- **Stateless** يعني السيرفر مش فاكر حاجة عنك بين request والتاني، عشان كده لازم تبعت الـ token في كل مرة.

## Practical exercise
```bash
A='Authorization: Demo alice'; J='Content-Type: application/json'; U=http://127.0.0.1:8787
curl -s -i -X POST $U/notes -H "$A" -H "$J" -d '{"title":"Hello","content":"x"}'      # 1
curl -s -i -X POST $U/notes -H "$A" -H "$J" -d '{"content":"x"}'                      # 2
curl -s -i -X POST $U/notes -H "$A" -H "$J" -d '{"title":"t","content":"x","userId":"bob"}'  # 3
curl -s -i $U/notes/not-a-uuid -H "$A"                                               # 4
curl -s -i $U/notes/00000000-0000-4000-8000-000000000000 -H "$A"                     # 5
```
Before running each, predict the status code and the `error.code`. Then check.

## Check your understanding
1. Why is `/deleteNote?id=5` not RESTful?
2. Which status code for: missing token; someone else's note; malformed JSON; unknown note id?
3. Why does the server reject a body that contains `userId`?
4. What does "stateless" mean and how does the API know who you are on each request?
5. Why does the thesis use 200 for DELETE, and what is the usual alternative?
6. What is in the `error` object and what is `requestId` for?

<details><summary>Answers</summary>

1. The URL contains a verb; REST puts the action in the method: `DELETE /notes/5`.
2. 401; 403; 400 (`MALFORMED_JSON`); 404.
3. The owner must come from the verified token, never from client input; rejecting unknown fields makes such attempts fail loudly (mass-assignment protection).
4. The server keeps no session; identity comes from the token sent with every request.
5. The thesis specifies 200 (and it lets the response carry a body in the same envelope). 204 No Content is the common alternative.
6. `code` (stable, machine-readable), `message` (human-readable), `requestId` (find the request in the logs), optional `details` (per-field problems).

Exercise: 1 → 201; 2 → 400 `VALIDATION_ERROR`; 3 → 400 `VALIDATION_ERROR` (unknown field); 4 → 400 `VALIDATION_ERROR`; 5 → 404 `NOT_FOUND`.
</details>
