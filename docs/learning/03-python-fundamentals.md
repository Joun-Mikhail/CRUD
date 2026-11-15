# Lesson 3 — Python used in the backend

## In one minute
The backend is ordinary Python 3.13 with no web framework. You need eight ideas: type hints, dataclasses, custom exceptions, functions that return functions (closures), `Protocol`, `lru_cache`, comprehensions and packages. Each is shown below with the real line that uses it.

## 1. Type hints
```python
def validate_page_size(raw: str | None) -> int:
```
"`raw` is a string or `None`; the function returns an `int`." Python does not enforce hints at run time; the tool `mypy` checks them before the code runs (`cd backend && .venv/bin/mypy`). `from __future__ import annotations` at the top of each file lets a class refer to itself in a hint before it is fully defined.

## 2. Dataclasses
```python
@dataclass(frozen=True)
class Note:
    note_id: str
    user_id: str
    title: str
    content: str
    created_at: str
    updated_at: str
    version: int = 1
```
`@dataclass` writes `__init__`, `__repr__` and `__eq__` for you. `frozen=True` makes objects read-only: `note.title = "x"` raises an error. To "change" a note you create a copy (`note.with_changes(title="x")`). Read-only data cannot be modified by accident somewhere far away.

## 3. Exceptions as a way to stop early
```python
class AppError(Exception):
    status: int = 500
    code: str = "INTERNAL_ERROR"

class NotFoundError(AppError):
    status = 404
    code = "NOT_FOUND"
```
Deep inside the service: `raise NotFoundError("Note not found")`. Nothing in between has to pass error values upwards; the wrapper at the top catches it once:
```python
except AppError as error:
    status, error_code = error.status, error.code
except Exception:   # anything unexpected
    status, error_code = 500, "INTERNAL_ERROR"
```
`raise X from None` hides the original low-level exception from the traceback chain; `raise X from error` keeps it for the logs.

## 4. Closures: a function that builds a function
`api_handler` in `http.py` receives an operation and returns a Lambda handler:
```python
def api_handler(operation_name, required_scope, operation, service_provider, *, cors_allow_origin, …):
    def handler(event, context):
        …
        result = operation(request, service_provider())
        …
    return handler
```
The inner `handler` remembers `operation` and the other arguments (that memory is the *closure*). So each of the five handler files is only a few lines:
```python
handler = api_handler("CreateNote", operations.SCOPE_WRITE, operations.create_note, runtime.get_service, …)
```
All shared behaviour (identity, logging, error mapping) is written once.

## 5. Protocol: "anything with these methods"
```python
class NotesRepository(Protocol):
    def create(self, note: Note) -> None: ...
    def get(self, note_id: str) -> Note | None: ...
```
The service accepts *any* object that has these methods. In production it is `DynamoNotesRepository`; in unit tests it is `FakeRepository` (a dict in memory). No inheritance needed. This is dependency injection: the service is *given* its repository instead of creating it.

## 6. `lru_cache`: do it once, reuse
```python
@lru_cache(maxsize=1)
def get_service() -> NotesService:
    settings = get_settings()
    table = boto3.resource("dynamodb").Table(settings.table_name)
    return NotesService(DynamoNotesRepository(table, settings.user_index_name))
```
The first call builds the objects; later calls return the same ones. In Lambda this means the expensive boto3 setup happens once per execution environment, not once per request.

## 7. Comprehensions and f-strings
```python
[note.to_api() for note in page.notes]                 # list comprehension
f"{self.created_at}#{self.note_id}"                    # f-string
{o["OutputKey"]: o["OutputValue"] for o in outputs}    # dict comprehension
```

## 8. Packages and imports
`backend/src/notes_api/` is a package (a folder of modules). `from notes_api.errors import NotFoundError` works because `src` is on the Python path (`pyproject.toml`: `pythonpath = ["src", "."]`; in Lambda, `CodeUri: ../backend/src/`).

One trap used on purpose in validation: `bool` is a subclass of `int` in Python, so `isinstance(True, int)` is `True`. That is why version checking says `isinstance(version, bool) or not isinstance(version, int)`.

## Important source files
`models/note.py` · `errors.py` · `http.py` · `runtime.py` · `repositories/notes_repository.py` (the Protocol) · `tests/unit/test_service.py` (the fake)

## بالعربي (مصري)
- الـ **closure**: دالة جوّه دالة، والدالة اللي جوّه "فاكرة" المتغيرات بتاعة اللي برّه حتى بعد ما اللي برّه تخلص. `api_handler` بتاخد العملية وترجّعلك handler جاهز فاكر العملية دي.
- **`frozen=True`** يعني الـ object بعد ما يتعمل ما يتغيّرش. لو عايز تغيّر حاجة بتعمل نسخة جديدة. ده بيمنع إن حتة كود بعيدة تبوّظلك البيانات من غير ما تاخد بالك.
- **Protocol** معناه "أي حاجة عندها الدوال دي تنفع". عشان كده في الاختبارات بنحط repository وهمي (dict في الميموري) مكان DynamoDB من غير ما نغيّر سطر في الـ service.
- **Exception** بنستخدمها عشان نوقف التنفيذ فورًا ونطلع بالغلط لفوق، بدل ما كل دالة ترجّع "حصل غلط" للي فوقها.

## Practical exercise
```bash
cd backend && .venv/bin/python
```
```python
import sys; sys.path.insert(0, "src")
from notes_api.models.note import Note
n = Note("id1", "alice", "T", "C", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")
n.title = "X"                       # what happens? why?
m = n.with_changes(title="X"); n.title, m.title, m.user_sort_key
from notes_api.validation.notes import validate_note_input
validate_note_input({"title": 5}, allow_version=False)   # read the exception's .details
```
Then: in `validation/notes.py` change `TITLE_MAX_LENGTH` usage by editing `config.py` to 100, run `.venv/bin/pytest tests/unit/test_validation.py -q`, see which tests fail and why, and change it back.

## Check your understanding
1. What does `str | None` mean, and what checks it?
2. Why is `Note` frozen?
3. How does a `NotFoundError` raised in the service become an HTTP 404?
4. What does `api_handler` return, and why is that useful?
5. How can the service work with both DynamoDB and a fake dictionary?
6. Why is `get_service` decorated with `lru_cache`?

<details><summary>Answers</summary>

1. The value is a string or `None`; `mypy` checks it statically — Python itself does not.
2. So a note cannot be changed by accident; changes are explicit copies.
3. It propagates up to `api_handler`, which catches `AppError` and uses its `status` and `code` to build the response.
4. A new function `handler(event, context)` that wraps the given operation with identity, logging and error handling — written once, used five times.
5. It depends on the `NotesRepository` Protocol (a set of methods), not on a concrete class; any object with those methods is accepted.
6. To build the boto3 resource and service once per Lambda execution environment and reuse them on warm invocations.

Exercise: assignment raises `FrozenInstanceError`; `details` contains `title must be a string` and `content is required`.
</details>
