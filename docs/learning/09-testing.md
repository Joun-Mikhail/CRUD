# Lesson 9 — Testing

## In one minute
A test is a small program that calls your code and checks the result. Tests are how this project *proves* claims such as "Bob cannot delete Alice's note" — and they are also honest about what they cannot prove: nothing here has been run against real AWS.

## The simple explanation
Three kinds of test, from fast and narrow to slow and broad:

| Layer | Runs | Proves | Does not prove |
|---|---|---|---|
| Unit | one function, no AWS | the logic is right | that the parts fit together |
| Integration | several layers + an in-memory DynamoDB (`moto`) | handler → service → repository works; DynamoDB expressions are valid | real AWS behaviour |
| End-to-end | a real browser against the running app | a user can actually do the journey | AWS-specific behaviour |
| Live (script, **not run**) | the deployed stack | real token validation, IAM, Cognito | — |

A good test has three steps — **arrange** (set up), **act** (call the code), **assert** (check). And it should fail when the behaviour it protects is broken. Coverage (99 % here) tells you which lines ran, not whether the checks were meaningful.

## In this repository
```
backend/tests/
  conftest.py            shared fixtures: in-memory table, handlers, make_event()
  unit/                  validation, pagination, identity, service (fake repository), http wrapper
  integration/           repository on moto, full API flow, Local Demo HTTP server
  security/              isolation, ownership, leakage, concurrency
frontend/src/**/*.test.ts(x)   unit + component tests (vitest)
frontend/tests/e2e/            browser tests (Playwright)
```
A **fixture** prepares something a test needs. This one gives every test a fresh, empty table that disappears afterwards (`conftest.py`):
```python
@pytest.fixture
def table(_aws_environment: None) -> Iterator[Any]:
    with mock_aws():
        dynamodb = boto3.resource("dynamodb")
        create_table(dynamodb)
        yield dynamodb.Table(TABLE_NAME)
```
A test from the thesis table (`integration/test_api_flow.py`):
```python
def test_thesis_table_07_get_other_users_note_returns_403(handlers: Handlers) -> None:
    note = create_note(handlers)                                              # arrange: Alice creates
    status, body = call(handlers["get"], make_event("GET", user=BOB, note_id=note["noteId"]))  # act: Bob reads
    assert (status, body["error"]["code"]) == (403, "FORBIDDEN")              # assert
```
**Parametrised** tests run one test body with many inputs:
```python
@pytest.mark.parametrize(("operation", "method"), [("get", "GET"), ("update", "PUT"), ("delete", "DELETE")])
def test_other_user_is_rejected_without_disclosure_or_side_effects(…):
```
A **fake** replaces a dependency with a simple stand-in — `FakeRepository` in `unit/test_service.py` is a dictionary with the same methods as the DynamoDB repository.

Tests can also check what must *not* happen:
```python
for forbidden in (SECRET_TITLE, SECRET_CONTENT, "eyJTOKEN", "Bearer"):
    assert forbidden not in output      # nothing sensitive in the logs
```
Results on 2026-11-15: 166 backend tests, 63 frontend tests, 12 browser tests, all passing (`evidence/tests/`).

**The honest limit.** `make_event(user=BOB)` simply *writes* Bob's id into the event. That proves what Lambda does when API Gateway says "this is Bob". It cannot prove that API Gateway rejects a forged token — only the live script against a deployed stack can (`scripts/testing/live_api_tests.py`, never run so far).

## Important source files
`backend/tests/conftest.py` · `tests/integration/test_api_flow.py` · `tests/security/test_isolation.py` · `docs/testing/TESTING.md` · `evidence/tests/`

## بالعربي (مصري)
- الـ **test** برنامج صغير بينادي الكود بتاعك ويتأكد إن النتيجة زي المتوقع. لو حد بوّظ حاجة بعدين، الـ test يقع وينبّهك.
- الـ **fixture** بتجهّز اللي الاختبار محتاجه (زي جدول فاضي في الميموري) وتشيله بعد ما يخلص، فكل اختبار يبدأ على نضيف.
- **moto** بيقلّد DynamoDB في الميموري. كويس عشان نتأكد إن المنطق صح، بس هو **مش** AWS الحقيقية.
- مهم جدًا: الاختبارات المحلية بتثبت إن الـ Lambda بيتصرف صح لما API Gateway يقوله "ده Bob". لكن إن API Gateway نفسه بيرفض token مزوّر — ده ما يتثبتش غير على AWS الحقيقية.

## Practical exercise
```bash
cd backend
.venv/bin/pytest -q                                   # everything
.venv/bin/pytest tests/security -v                    # read the test names: they are the security claims
.venv/bin/pytest --cov --cov-report=term-missing | tail -30
```
Now write a test yourself. Add to `tests/integration/test_api_flow.py`:
```python
def test_title_is_trimmed_on_create(handlers: Handlers) -> None:
    note = create_note(handlers, title="   padded   ")
    assert note["title"] == "padded"
```
Run it (`.venv/bin/pytest -k trimmed -v`). Then make it fail on purpose by expecting `"   padded   "`, read the failure message, and fix it. Finally write one more test of your own: creating a note with a 201-character title must return 400.

## Check your understanding
1. What are arrange, act and assert?
2. Why does each test get a new table?
3. What is the difference between a fake repository and moto?
4. Coverage is 99 %. Does that prove the API is secure? Why not?
5. Which claim can only be verified on real AWS, and which file does that?
6. Why do the security tests check the response *body* and the note afterwards, not only the status code?

<details><summary>Answers</summary>

1. Set up the situation; perform the action; check the outcome.
2. Isolation: tests must not influence each other and must be repeatable in any order.
3. The fake is a hand-written dictionary used to test the service without any DynamoDB semantics; moto emulates the DynamoDB API so real boto3 calls and expressions are exercised.
4. No. Coverage shows lines executed, not that the right things were asserted, and it says nothing about components outside the code (API Gateway, IAM, Cognito).
5. Real JWT validation by API Gateway (signature, expiry, scope) — `scripts/testing/live_api_tests.py`.
6. A 403 that still leaks the content, or that changed the note anyway, would be a vulnerability; the test must show no disclosure and no side effect.
</details>
