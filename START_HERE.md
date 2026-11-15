# Start here

Welcome. This page gets you from zero to a running application in ten minutes and tells you what to read next. No AWS account is needed for any of it.

## What is this?

**Serverless Notes** is a small web application: sign in, write private notes, edit and delete them. It exists to demonstrate the subject of the thesis — a *serverless CRUD API with authentication* on AWS.

| Word | Meaning |
|---|---|
| **Backend** | the part users never see: rules, security, data storage. Here: Python code in `backend/` |
| **API** | the contract through which programs talk to the backend: "send this, get that" |
| **REST** | a style of API that uses plain HTTP: URLs name things, methods say what to do |
| **CRUD** | Create, Read, Update, Delete — the four basic operations on stored data |
| **Serverless** | you upload code; the cloud runs it only when a request arrives and bills per request. You manage no servers |
| **Authentication** | proving who you are (sign-in → token) |
| **Authorization** | deciding what you may do (only *your* notes) |

## How the AWS services work together

```
You ── sign in ──▶ Cognito            gives your browser a signed token
You ── request + token ──▶ API Gateway   checks the token, picks the function
                              └─▶ Lambda     runs the Python code: validate, check ownership
                                     └─▶ DynamoDB   stores / returns the note
                           CloudWatch ◀── logs and alarms from all of them
```

## Run it (Local Demo)

```bash
make setup            # once: installs Python and Node dependencies
make demo-backend     # terminal 1 — the real backend code with an in-memory database
make demo-frontend    # terminal 2 — open http://localhost:5173
```
Pick "Continue as Alice". Create, edit and delete a note. Open **Settings → Switch demo identity → Bob**: Alice's notes are gone, because Bob may not see them. Open **Architecture** for an interactive walkthrough and **API explorer** to send raw requests and see status codes.

The Local Demo runs every line of the real backend, but identities are simulated and the database is an in-memory emulator. The yellow banner says so. Real Cognito sign-in works only after deploying to AWS (`docs/deployment/DEPLOYMENT.md`).

Run the tests:
```bash
make test             # 166 backend + 66 frontend tests
make test-e2e         # 14 browser tests
```

## Which files to read first (in this order)

| # | File | Why |
|---|---|---|
| 1 | `backend/src/notes_api/operations.py` | the five operations, ~70 lines — the whole API at a glance |
| 2 | `backend/src/notes_api/models/note.py` | what a note is |
| 3 | `backend/src/notes_api/validation/notes.py` | what input is accepted |
| 4 | `backend/src/notes_api/services/notes_service.py` | the rules: ids, timestamps, 403 vs 404 |
| 5 | `backend/src/notes_api/repositories/notes_repository.py` | how DynamoDB is used; the ownership condition |
| 6 | `backend/src/notes_api/http.py` | how a function becomes a Lambda handler; errors and logging |
| 7 | `backend/tests/integration/test_api_flow.py` | the thesis's test table as executable tests |
| 8 | `infrastructure/template.yaml` | every AWS resource, with comments |

## Then

1. Work through [`docs/learning/`](docs/learning/README.md) — twelve lessons with exercises (and Egyptian-Arabic explanations of the tricky parts), ending in a two-week plan to rebuild the backend yourself.
2. Read [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) — what the assignment demands, what the semestral report said, and what was changed and why.
3. Rehearse [`SUPERVISOR_QUESTIONS.md`](SUPERVISOR_QUESTIONS.md).
4. Deploy to your own AWS account ([`docs/deployment/DEPLOYMENT.md`](docs/deployment/DEPLOYMENT.md)), run `make live-test`, and measure performance — these steps have **not** been done yet and the thesis needs them.

## Being straight about where this stands

This is a reference implementation built with AI assistance. Everything that can be checked without AWS has been checked and the evidence is in `evidence/`. It has **never been deployed**. See [`PROJECT_COMPLETION_REPORT.md`](PROJECT_COMPLETION_REPORT.md) for the exact status. For the thesis, the understanding and the AWS results have to be yours.
