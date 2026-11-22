# Contributing

This repository is the reference implementation of a bachelor thesis, so changes are reviewed carefully. Small fixes and well-scoped improvements are welcome.

## Set up

Requirements: Python 3.13, Node.js 22, make.

```bash
make setup            # backend virtualenv + frontend dependencies
make demo-backend     # terminal 1 — Local Demo API on http://127.0.0.1:8787
make demo-frontend    # terminal 2 — app on http://localhost:5173
```
No AWS account is needed for development. See [`START_HERE.md`](START_HERE.md) for a tour of the code.

## Before opening a pull request

```bash
make lint typecheck   # ruff, mypy --strict, eslint, tsc
make test             # backend (pytest + coverage ≥ 85 %) and frontend (vitest)
make test-e2e         # Playwright, including the accessibility audit
make validate         # cfn-lint + sam validate, if infrastructure/ changed
```
CI runs the same checks on every pull request.

## Ground rules

- Keep the API contract stable: the five endpoints, the response envelope and the status codes are fixed by the thesis (see [`docs/api/API.md`](docs/api/API.md)).
- Do not weaken the security rules listed in [`CLAUDE.md`](CLAUDE.md): identity only from verified token claims, ownership checks inside the DynamoDB condition, no content or tokens in logs, one IAM action per function.
- Every behaviour change comes with a test, and with a documentation update where behaviour is described.
- Never commit secrets, AWS account ids, `frontend/.env.aws` or `infrastructure/samconfig.toml`.
- Only claim results you actually ran; store real command output under `evidence/`.

## Commit messages

Imperative mood, one topic per commit, e.g. `Reject unknown fields in PUT /notes/{id}`.

## Reporting security problems

Privately, as described in [`.github/SECURITY.md`](.github/SECURITY.md) — never in a public issue.
