# Final project status

Date: 2026-11-18. Development is closed. This page separates what was **verified on AWS**, what was **verified locally (Local Demo)**, and what is **not verified**.

## What the deployed AWS infrastructure does

| Part | What it does | Where |
|---|---|---|
| CloudFront + private S3 (`serverless-notes-dev-web`) | Serves the React app over HTTPS at https://d11c0a7q5fx9qi.cloudfront.net. Unknown paths (403/404) return `index.html`, so deep links such as `/lab/{id}/report` work. | `infrastructure/frontend-hosting.yaml` |
| Cognito user pool | Sign-up, e-mail verification, hosted sign-in (authorization code + PKCE), password reset; issues RS256 access tokens with the scopes `notes/read` and `notes/write`. | `infrastructure/template.yaml` |
| API Gateway REST API | Five routes under `/notes`; the Cognito authorizer checks the token and scope before any code runs; throttle 10 req/s, burst 20, per method; uniform error envelope. | same |
| Five Lambda functions (Python 3.13, arm64) | Create, list, get, update, delete. User identity comes only from the token's `sub`; ownership is checked inside the DynamoDB write. | `backend/src/notes_api/` |
| DynamoDB | Table with key `noteId`, index `byUser` for listing one user's notes; on-demand billing. | same |
| CloudWatch | Structured logs (14 days) and four alarms. | same |

## What LabProof Lite actually does

LabProof Lite is a frontend module for **one** Ohm's law experiment, built on the same notes API. No backend, table or endpoint was added.

- The student enters a title, course, date, nominal resistance and tolerance, 3–10 voltage/current readings, observations and a conclusion. Observations and conclusion are optional, so unfinished work can be saved.
- The app calculates R = V / (I_mA / 1000) per row, the mean, the least-squares slope through the origin (R_fit = Σ(VI)/Σ(I²)) and the deviation from the nominal value. **PASS** means only that |deviation| ≤ tolerance; it does not prove Ohm's law. Linearity is judged from the V–I graph.
- Invalid input is rejected with a message on the row: empty fields, text, zero or negative values, and `Infinity` or numbers too large or small to calculate with. Nothing non-finite is shown, plotted or saved.
- The experiment is saved as an ordinary note: the title, plus JSON content `labproof/ohms-law` v1 holding only the inputs. Updates send `version` (optimistic locking, 409 on conflict).
- The printable report describes the method as the **standard procedure** and says the student is responsible for the data and conclusions. It labels the built-in example values as *illustrative*. Before printing an incomplete report it shows a warning with **Print anyway**.

## What was verified

| Check | Environment | Result | Date / evidence |
|---|---|---|---|
| Backend: 193 tests, 99 % coverage | local (moto) | passed | 2026-11-17, `evidence/tests/backend-pytest.txt`; re-run 2026-11-18 (`evidence/tests/final-release-checks.txt`) |
| 38 live API checks (CRUD, isolation, tokens, validation, CORS, throttling) | **AWS** | 38/38 passed | 2026-11-17, `evidence/tests/live-api-tests.json` |
| 10 negative-token tests | **AWS** | all as expected | 2026-11-17, `evidence/tests/token-security-tests.json` |
| Browser test of the Notes app with real Cognito users | **AWS** | passed | 2026-11-17, `docs/testing/TESTING.md` |
| Benchmarks (sequential; 1–8 concurrent clients) | **AWS** | median ≈ 120 ms | 2026-11-17, `evidence/benchmarks/` |
| Frontend typecheck, ESLint, production build | local | passed | 2026-11-18, `evidence/tests/final-release-checks.txt` |
| Frontend unit/component tests | local | 118 passed | same |
| Playwright (Notes CRUD, isolation, pagination, guards, LabProof journey create → calculate → graph → save → reload → edit → save → report → print warning → delete, isolation between two users, phone width, axe accessibility audit in both themes) | **Local Demo** | 17 passed | same |
| LabProof report printed to A4 PDF in Chromium | Local Demo | 2 pages, readable | 2026-11-18 (visual check, not stored) |
| Read-only AWS checks: CLI identity, both stacks (`UPDATE_COMPLETE` / `CREATE_COMPLETE`), four alarms `OK`, API answers 401 without a token, Cognito callback/logout URLs include the CloudFront site, code flow only | **AWS** | as expected | 2026-11-18, `evidence/tests/final-release-checks.txt` |
| Live site: `/`, `/lab`, `/lab/new`, `/lab/{id}`, `/lab/{id}/report`, `/notes`, `/auth/callback` return the app (HTTP 200); bundle is built in `aws` mode and contains LabProof (the PR #12 version) | **AWS** (CloudFront) | as expected | same |

## Not verified

- **LabProof against real Cognito, API Gateway, Lambda and DynamoDB.** Signing in needs your credentials, so no automated or AI-run test was done. Do the manual check below once after deployment and record the result.
- Alarm notifications, load above ≈ 60 req/s, a penetration test, and tokens from a second real user pool (see the bachelor's draft, Section 14.3).
- The site currently serves the PR #12 build. The fixes in the final-release pull request reach the public site only after you merge the pull request and publish the site yourself.

### Manual LabProof check on AWS (about 10 minutes)

1. Open https://d11c0a7q5fx9qi.cloudfront.net and sign in with your own test account. Never paste passwords or tokens anywhere else.
2. **LabProof → New experiment → Fill illustrative example.** Enter the title `AWS check (delete me)` and a course, then press **Save experiment**. You should see *Experiment created* and the address `/lab/<id>`.
3. Press **F5**: every field comes back from DynamoDB.
4. Change current reading 2, press **Save changes**, then press F5 again: the new value is kept.
5. **Lab report** → **Print / Save as PDF**. The incomplete-report warning appears; press **Print anyway**, then cancel the dialog.
6. Back on the experiment, press **Delete → Delete experiment**. The experiment disappears from **LabProof**.
7. Write the date and "passed/failed" for steps 2–6 in `docs/testing/TESTING.md`. Optionally add a screenshot without e-mail addresses under `evidence/screenshots/`.

## Known limitations

- **LabProof:** one experiment type; at most 10 readings; no measurement-uncertainty analysis; trailing zeros are not kept (1.00 → 1); PDF layout depends on the browser; `/lab` lists experiments only among the notes loaded so far (**Load more notes**).
- **Backend:** the throttle is per method and shared by all users; a token stays valid until it expires (≤ 60 min); no MFA or WAF; no backups or deletion protection in the development stage; single region.
- **Evidence:** all measurements come from one client machine. Thesis screenshots show the earlier teal design.

## Manuscript impact (author review needed)

The final changes affect only LabProof, which neither manuscript describes, so no manuscript statement became wrong. Two places still deserve your attention:

- **Bachelor's draft, Section 6.5, and semestral Section 5.8** describe the web client as a notes list and editor. The live site now also contains LabProof. Decide with your supervisor whether to mention it, as a locally verified extension, or to leave it out (decision D5 in `docs/thesis/FINAL_STUDENT_CHECKLIST.md`). Do not describe it as AWS-verified unless the manual check above has passed and been recorded.
- **Screenshots** in the manuscripts (Figures 6.1, 9.1, 11.4) are historical (17 November 2026) and remain valid as dated evidence.

## What remains for academic submission

See `docs/thesis/FINAL_STUDENT_CHECKLIST.md`. In short:
- read and rewrite the manuscripts in your own words;
- agree with your supervisor on the AI-use statement and the status of the revised semestral report;
- obtain the official bachelor's assignment and title pages, and move both texts into the official template;
- check the references and Cost Explorer;
- capture the missing screenshots;
- sign the declarations only when they are true.

## Reproduce locally

```bash
make setup            # once
make demo-backend     # terminal 1: real handlers + in-memory DynamoDB on :8787
make demo-frontend    # terminal 2: http://localhost:5173 → "Continue as Alice"
cd frontend && npm test && npx playwright test --project=chromium
```

Use `--project=chromium`; the `screenshots` project overwrites the tracked images in `evidence/screenshots/`.

## Demonstrate the live application

Open https://d11c0a7q5fx9qi.cloudfront.net, sign in with your test account, and follow `docs/thesis/DEMO_SCRIPT.md` (Notes) and `docs/learning/LABPROOF_DEMO_SCRIPT.md` (LabProof). Its Bob/Alice isolation step needs a second test account on AWS. Study guide: `docs/learning/FINAL_PROJECT_STUDY_GUIDE.md`.
