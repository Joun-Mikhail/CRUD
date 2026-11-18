# Final project study guide

A short route through the whole project for the defence. Each topic gives a plain explanation and the **one or two files to study**. The longer guides (`docs/learning/01–12`, `LABPROOF_FOR_BEGINNERS.md`) go deeper if you need them.

## 1. The overall AWS architecture

The browser loads the React app from **CloudFront** (a content delivery network) in front of a private **S3** bucket. The user signs in with **Amazon Cognito** (a managed user directory), which issues tokens. Every API call goes to **API Gateway** (REST API). Its Cognito authorizer checks the token and the OAuth scope before any code runs. It then calls one of **five Lambda functions** (Python 3.13, one per operation), which read and write **DynamoDB**. **CloudWatch** stores the logs and runs four alarms. One **AWS SAM** template describes the whole backend; a second template describes the hosting. Everything runs in eu-north-1 (Stockholm).

Study: `infrastructure/template.yaml` (search for `Type: AWS::`), `docs/thesis/figures/fig-architecture.png`.

## 2. What happens when a user signs in

1. The app creates a random secret (`code_verifier`) and sends only its SHA-256 hash (`code_challenge`) when it redirects to Cognito's hosted sign-in page. This is **PKCE**.
2. After the password check, Cognito redirects back to `/auth/callback` with a one-time **authorization code**.
3. The app exchanges the code and the original verifier for tokens. An intercepted code is useless without the verifier.
4. The **access token** (a JWT signed with RS256, valid for 60 minutes) is kept **in memory only**, never in `localStorage`.

Study: `frontend/src/services/cognito/oauth.ts`, `frontend/src/services/auth/cognitoAuth.ts`.

## 3. What happens when the user creates a note

`POST /notes` with `Authorization: Bearer <access token>` and `{"title", "content"}`:

1. API Gateway verifies the token's signature, issuer and expiry, and requires the `notes/write` scope. If any check fails, it answers 401 and no Lambda runs.
2. The CreateNote Lambda reads the user ID **only** from the verified claims (`claims.sub`).
3. `operations.py` validates the body. It accepts exactly `title` and `content`, rejects unknown fields and enforces the size limits.
4. The service creates `noteId` (a UUID), the timestamps and `version = 1`. The repository writes the item with `PutItem`.
5. The function answers **201** with `{"data": note}` and writes one JSON log line.

Study: `backend/src/notes_api/http.py`, `backend/src/notes_api/handlers/create_note.py`.

## 4. How API Gateway and Lambda work together

API Gateway is the front door. It handles HTTPS, authentication, scopes, throttling (10 req/s, burst 20, per method), CORS and uniform error bodies. It passes the request to a Lambda function as an **event**, which includes the verified token claims. The function returns a status code and a JSON body. Each of the five functions has its own IAM role that allows exactly one DynamoDB action (least privilege).

Study: `infrastructure/template.yaml` (`Events:` and `Policies:` of each function), `backend/src/notes_api/http.py`.

## 5. Why DynamoDB was selected

DynamoDB is a managed key-value database. It needs no server and charges per request in on-demand mode, which fits a small, irregular workload, and it stores data in three availability zones. Every access uses a key: `GetItem` by `noteId`, and `Query` on the index `byUser` (`userId`, newest first) to list one user's notes. A `Scan` of the whole table is never used. A relational database would need a permanently running instance, which costs money even when idle.

Study: `backend/src/notes_api/repositories/notes_repository.py`, `docs/database/`.

## 6. How data is protected between users

- The user ID comes only from the verified token (`claims.sub`), never from the request body. Unknown fields such as `userId` are rejected with 400.
- **Read:** the service loads the note and compares its owner with the caller. Another user's note gives **403**, a missing note **404**.
- **Update and delete:** the owner check is part of the DynamoDB **condition expression**: `attribute_exists(noteId) AND userId = :owner [AND version = :expectedVersion]`. The check and the write are one atomic operation, so no race is possible.
- **List:** the query reads only the caller's partition of the `byUser` index.

Study: `backend/src/notes_api/services/notes_service.py`, `backend/src/notes_api/repositories/notes_repository.py`.

## 7. How LabProof stores experiment information

An experiment is an **ordinary note**, so it needs no new endpoint, table or Lambda. The note's title is the experiment title. The note's content is a small JSON document marked `"format": "labproof/ohms-law", "formatVersion": 1`. It holds only what the student typed: course, date, nominal resistance, tolerance, readings, observations and conclusion. Calculated values are **not stored**; they are recomputed on every open. `fromNote()` accepts only valid version-1 data with finite positive numbers. Anything else stays an ordinary note. Saving uses the same `POST`/`PUT` with `version` (optimistic locking) as the notes.

Study: `frontend/src/lab/experimentFormat.ts`.

## 8. How the resistance calculations work

- Per reading: **Rᵢ = Vᵢ / Iᵢ**, with the current converted from mA to A: I(A) = I(mA) / 1000. Example: 1.0 V / 0.0046 A ≈ 217 Ω.
- Mean: R̄ = (1/n) Σ Rᵢ.
- Best fit through the origin (least squares, V = R·I): **R_fit = Σ(VᵢIᵢ) / Σ(Iᵢ²)**. This minimises Σ(Vᵢ − R·Iᵢ)².
- Deviation: δ = (R_fit − R_nom) / R_nom · 100 %.
- **PASS** if |δ| ≤ tolerance, otherwise **CHECK**. PASS says only that the fitted resistance agrees with the printed value; linearity is judged from the graph.
- Invalid input (empty, text, zero or negative values, or `Infinity` and numbers too large or too small to calculate with) is rejected before anything is computed or saved.

Study: `frontend/src/lab/ohmsLaw.ts`, `frontend/src/lab/ohmsLaw.test.ts`.

## 9. How the graph is created

The graph is hand-written SVG, with no chart library. The x axis is current I (mA) and the y axis is voltage V (V); both start at 0. `niceScale()` rounds each axis end up to 1, 2, 2.5 or 5 × 10ⁿ. The dots are the readings. The dashed line is V = R_fit · I, drawn from the origin to the edge of the plot. Tailwind classes replace inline styles, because the production security policy (CSP) forbids inline styles.

Study: `frontend/src/lab/VIChart.tsx`, `frontend/src/lab/chartScale.ts`.

## 10. How the laboratory report is exported

`/lab/{id}/report` builds the report from the **saved** note: aim, method (worded as the standard procedure), table, worked calculations, results, graph, observations and conclusion. **Print / Save as PDF** calls the browser's `window.print()`. Print CSS (Tailwind `print:` classes) hides the navigation, and the browser's "Save as PDF" writes the file. If the observations or the conclusion are empty, a warning appears first, with **Print anyway**. The built-in example data are labelled *illustrative* on the report.

Study: `frontend/src/pages/lab/LabReportPage.tsx`.

## 11. Why serverless technology was chosen

There are no servers to patch or size, scaling is automatic, and you pay per request, so the idle cost is close to zero. The measured cost model is about **USD 1 per month** at demonstration scale (list price), against about **USD 20 per month** for an always-on t3.small. The trade-offs are cold starts (≈ 0.3–0.7 s for a new environment), provider lock-in, platform limits, and higher cost at constant high load.

Study: `docs/thesis/BACHELOR_THESIS_DRAFT.md` Chapter 13, `AWS_COST_ANALYSIS.md`.

## 12. Technical limitations

- The throttle applies per method and is shared by all users.
- An access token stays valid until it expires (≤ 60 min), even after sign-out or account deletion.
- There is no MFA or WAF, no backups in the development stage, and only one region.
- No load above ≈ 60 req/s was measured, and all measurements come from one client machine.
- LabProof has one experiment type, at most 10 readings, no measurement-uncertainty analysis, and browser-dependent PDF layout. Its end-to-end tests ran in the Local Demo. A browser run against AWS needs your manual check (`docs/FINAL_PROJECT_STATUS.md`).

Study: `docs/thesis/BACHELOR_THESIS_DRAFT.md` Section 14.3, `docs/FINAL_PROJECT_STATUS.md`.

---

## 15 likely supervisor questions

1. **Why five Lambda functions instead of one?** Each function's IAM role can allow exactly one DynamoDB action, and each operation gets its own logs and metrics. The cost is five separate cold starts.
2. **How does the API know who the user is?** From `event.requestContext.authorizer.claims.sub`, which only API Gateway fills after verifying the token. The body can never set the user.
3. **Why 403 for another user's note, and not 404?** The assignment's design requires it. It reveals only that a random 122-bit UUID exists, which is a small disclosure.
4. **What prevents two edits from overwriting each other?** Optimistic locking. PUT sends `version`, and DynamoDB writes only if the stored version matches; otherwise the API returns 409 and nothing is overwritten.
5. **Why is the ownership check in the condition expression?** The check and the write become one atomic operation, so nothing can change in between. A failed condition also returns the old item, from which 403, 404 or 409 is derived without a second read.
6. **What is PKCE and why is it needed?** A browser app cannot keep a client secret. PKCE binds the authorization code to a one-time secret, so an intercepted code is useless.
7. **Why are tokens kept in memory?** Storage such as `localStorage` can be read by any injected script. Memory is lost on reload, which is accepted; the user signs in again.
8. **What happens with an expired or forged token?** API Gateway rejects it before any Lambda runs: 401 when the token is unusable, 403 for a bad signature. On AWS, all eight forged, tampered or expired tokens were rejected (Table 12.1). One caveat: a valid token of a deleted user still works until it expires.
9. **Why DynamoDB and not a relational database?** The access patterns are simple and keyed, it is pay-per-request with no idle server, it scales without capacity planning, and it is replicated across three zones.
10. **How did you measure performance?** End to end from one client: 500 sequential requests and closed-loop runs with 1–8 concurrent clients. The median was ≈ 120 ms, of which ≈ 10 ms was inside Lambda. That is one location, not a load test.
11. **Why is R_fit computed as Σ(VI)/Σ(I²)?** It is the least-squares slope of a line through the origin. Ohm's law predicts V = R·I with no intercept, and minimising Σ(V − R·I)² gives that formula.
12. **Does PASS prove Ohm's law?** No. PASS means only that the fitted resistance lies within the nominal tolerance. Linearity is judged from the points on the graph, and a full analysis would also need measurement uncertainty.
13. **Is the least-squares fit immune to bad readings?** No. Errors are squared, and high-current readings carry the most weight, so one wrong high-current reading can shift R_fit. That is why the mean and every point are shown too.
14. **Why are LabProof results not stored in the database?** They are derived data. Recomputing them from the stored inputs guarantees they always match the formulas, even after a bug fix.
15. **What would you change for production?** MFA, a WAF, per-user rate limits, backups (point-in-time recovery) and deletion protection, SES for e-mail, a custom domain, a tested alarm notification, and a distributed load test.
