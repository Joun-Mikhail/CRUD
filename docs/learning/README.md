# Learning package

Twelve short lessons that explain this repository well enough for you to rebuild the backend yourself and defend it. Every lesson has: a one-minute summary, a plain explanation, the real code from this repository, a short **بالعربي (مصري)** section for the confusing ideas, a hands-on exercise, and questions with answers.

Everything here runs **without AWS** (Local Demo + pytest). Set up once: `make setup`.

| # | Lesson | You will be able to explain |
|---|---|---|
| 1 | [What the project does](01-what-the-project-does.md) | the product, the five operations, why serverless |
| 2 | [REST APIs](02-rest-api.md) | resources, methods, status codes, the JSON envelope |
| 3 | [Python used in the backend](03-python-fundamentals.md) | type hints, dataclasses, exceptions, closures, Protocol |
| 4 | [AWS Lambda](04-aws-lambda.md) | handler, event, response, cold start |
| 5 | [API Gateway](05-api-gateway.md) | routes, proxy integration, authorizer, CORS, throttling |
| 6 | [DynamoDB](06-dynamodb.md) | keys, the index, Query vs Scan, conditional writes |
| 7 | [Cognito and JWT](07-cognito-and-jwt.md) | authentication vs authorization, tokens, PKCE |
| 8 | [The whole request lifecycle](08-request-lifecycle.md) | every file a `PUT /notes/{id}` touches |
| 9 | [Testing](09-testing.md) | what each test layer proves — and does not prove |
| 10 | [Deployment](10-deployment.md) | SAM template → CloudFormation → running system, CI/CD |
| 11 | [Security](11-security.md) | ownership, race conditions, least privilege, hygiene |
| 12 | [Performance and cost](12-performance-and-cost.md) | latency, scaling, pay-per-use arithmetic |

## LabProof Lite (frontend extension)

| Document | Use it to |
|---|---|
| [LabProof for beginners](LABPROOF_FOR_BEGINNERS.md) | understand the Ohm's law workflow, formulas, JSON storage, the save path through AWS, the graph, printing, and ten likely supervisor questions |
| [LabProof practice](LABPROOF_PRACTICE.md) | five small exercises that prove you understand it |
| [LabProof demo script](LABPROOF_DEMO_SCRIPT.md) | an 8-minute live demonstration for your supervisor |

## Two-week rebuild plan

The goal is not to copy files but to write them again from an empty folder, looking at the reference only when stuck.

| Day | Build | Check yourself with |
|---|---|---|
| 1 | Read lessons 1–3. Write `models/note.py` and `errors.py` from memory | `python -c` experiments |
| 2 | `validation/notes.py` | make `tests/unit/test_validation.py` pass |
| 3 | `pagination.py`, `security/identity.py` | `test_pagination.py`, `test_identity.py` |
| 4 | Lesson 6. `repositories/notes_repository.py`: create + get | first tests of `test_repository.py` |
| 5 | Repository: list, update, delete with conditions | rest of `test_repository.py` |
| 6 | `services/notes_service.py` | `test_service.py` |
| 7 | Lessons 4–5. `http.py` (`api_handler`) | `test_http.py` |
| 8 | `operations.py`, `handlers/*`, `runtime.py` | `test_api_flow.py` |
| 9 | Run the security suite; fix what fails; read lesson 11 | `tests/security` |
| 10 | Lesson 7 and 10. Write the SAM template: table + one function + API | `cfn-lint`, `sam validate` |
| 11 | Add Cognito, the authorizer, the other four functions | same |
| 12 | Deploy to your own AWS account; `make live-test` | live evidence file |
| 13 | Measure latency (lesson 12); take real CloudWatch screenshots | `evidence/benchmarks/` |
| 14 | Answer every question in `SUPERVISOR_QUESTIONS.md` aloud without notes | — |

Honesty note: this reference implementation was produced with AI assistance and has **not** been deployed to AWS. Days 12–13 are yours to do; the results belong in your thesis only after you have produced them.
