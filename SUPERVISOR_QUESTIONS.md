# Questions a supervisor or opponent may ask

Thirty-eight questions with short, accurate answers. Practise saying them aloud in your own words; point to the file when you can. Where the honest answer is "not done yet", say so — examiners respect a precise limit far more than a vague claim.

## Architecture

**1. Describe the architecture in one minute.**
A React client signs users in with Amazon Cognito and calls a REST API on API Gateway. API Gateway verifies the JWT with a Cognito authorizer and invokes one of five Python Lambda functions. The functions validate input, enforce ownership and store notes in a DynamoDB table. Logs, metrics and alarms go to CloudWatch. Everything is defined in one SAM template (`infrastructure/template.yaml`) in eu-north-1.

**2. Why serverless rather than a virtual machine or container?**
No servers to patch or scale, automatic scaling per request, and pay-per-use — idle cost is close to zero, which suits a small application with irregular traffic. The costs are cold starts, statelessness, vendor lock-in and a harder local test story. At constant high load, always-on capacity can become cheaper.

**3. Why five Lambda functions instead of one (or the three in the semestral report)?**
Each function gets an IAM role with exactly one DynamoDB action (GetNote cannot delete), its own log group and its own metrics. They share one code package, so there is no duplication: each handler file is about ten lines built by `http.api_handler`. The price is more resources and separate cold starts.

**4. How is the code structured and why?**
Handler → operation → service → repository. `http.py` handles HTTP concerns, `operations.py` parses and validates, `services/notes_service.py` holds business rules, `repositories/notes_repository.py` is the only code that calls DynamoDB. The service depends on a `Protocol`, so it is unit-tested with an in-memory fake. Adding another entity means adding files, not changing existing ones.

**5. What would you change for a production system?**
Per-user rate limiting or WAF, MFA, SES for e-mail, hosting the frontend on S3 + CloudFront, backups (the template enables point-in-time recovery for `Stage=prod`), tracing, a staging environment, and load testing. See the limitations in `docs/security/SECURITY.md`.

## REST and API design

**6. Why these five endpoints, and why PUT rather than PATCH?**
They are the endpoints specified in the thesis. PUT replaces the whole resource, so both `title` and `content` are required; PATCH (partial update) is not in the specification and was not added.

**7. Why does DELETE return 200 and not 204?**
The thesis specifies 200. It also lets the response keep the uniform `{"data": …}` envelope. 204 No Content is equally conventional and would be a one-line change.

**8. Why 403 for another user's note instead of 404?**
The thesis requires 403 when the note exists and 404 when it does not. The trade-off is that an authenticated user can learn that a specific UUID exists. Ids are random UUIDv4 values and nothing about the note is disclosed, so the leak is minimal; an API that wants to hide existence would return 404 for both. I can state both arguments (`docs/api/API.md`).

**9. How are errors reported?**
Always as `{"error": {"code", "message", "requestId", "details?"}}` — from Lambda and, through custom gateway responses, from API Gateway too. `code` is stable for programs, `requestId` finds the request in CloudWatch. Unexpected exceptions become a generic 500; the stack trace is only logged.

**10. What is validated?**
JSON object only; exactly the allowed fields (unknown fields rejected); string types without implicit conversion; title 1–200 characters after trimming, no control characters; content up to 20,000 characters; UUID path parameter; body size; `limit` 1–100; a well-formed pagination token. All problems are returned together (`validation/notes.py`).

**11. How does pagination work?**
`GET /notes?limit=20` returns a page and `meta.nextToken`. The token is the base64url-encoded position in the index (sort key + note id). The server rebuilds DynamoDB's `ExclusiveStartKey` from the token plus the authenticated user id, so a token cannot point into another user's data.

## Authentication and JWT

**12. What is the difference between authentication and authorization here?**
Authentication: Cognito issues a token; API Gateway verifies it (401 on failure). Authorization: Lambda and a DynamoDB condition check that the note's `userId` equals the token's `sub` (403), and API Gateway checks the OAuth scope.

**13. What is inside the JWT and how is it verified?**
Header (`alg: RS256`, `kid`), payload (`iss`, `sub`, `client_id`, `token_use`, `scope`, `exp`…), signature. API Gateway verifies the RSA signature against the user pool's public keys (JWKS), the issuer and the expiry. The payload is readable by anyone; the signature prevents modification.

**14. The semestral report showed an HS256 token and said API Gateway checks `aud`. Is that right?**
No, and I corrected it. Cognito signs with RS256 (asymmetric). ID tokens have `aud`; access tokens carry `client_id` instead. The report's Cognito figure also showed identity pools, which this system does not use — only a user pool.

**15. Access token or ID token — which one does the API accept, and why?**
Only access tokens. Each route requires an OAuth scope (`notes/read` or `notes/write`), and scopes exist only in access tokens. Lambda additionally rejects `token_use != "access"` (`security/identity.py`).

**16. Explain Authorization Code with PKCE.**
The app creates a random `code_verifier`, sends its SHA-256 hash (`code_challenge`) with the login redirect, the user authenticates on Cognito's page, and Cognito redirects back with a one-time code. The app exchanges the code plus the original verifier for tokens. An intercepted code is useless without the verifier. `state` protects against forged callbacks.

**17. Where are tokens stored in the browser?**
In JavaScript memory only — not `localStorage` or `sessionStorage`. After a reload the app re-runs the redirect, which is silent while Cognito's session is alive. This limits what a successful XSS could steal later; it does not make XSS harmless.

**18. Does the backend ever see the user's password?**
No. Passwords are typed on the Cognito hosted page (sign-in) or sent directly from the browser to Cognito's API (sign-up). Lambda only receives verified claims.

## Authorization and security

**19. How do you guarantee user A cannot access user B's notes?**
The owner is taken only from the verified `sub`. GET compares it with the stored `userId`. PUT and DELETE include `userId = :owner` in the DynamoDB condition, so the check and the write are atomic. Listing queries only the caller's partition of the index. `tests/security/test_isolation.py` exercises every method.

**20. Can a client set the owner of a note?**
No. `userId` is not an accepted field; a body containing it is rejected with 400, and the stored owner always comes from the token. An update cannot change `userId` either.

**21. What happens with two simultaneous updates?**
Each PUT may carry the `version` it read. The write succeeds only if the stored version still matches, then increments it; the loser gets 409 and nothing is overwritten. A test runs sixteen concurrent writers: exactly one owner update wins and every non-owner gets 403.

**22. How is least privilege applied?**
Each function's role allows one action on one resource: `PutItem`, `GetItem`, `UpdateItem`, `DeleteItem` on the table, or `Query` on the `byUser` index. No wildcards. No function can scan the table.

**23. What do the logs contain, and what not?**
One JSON line per request: request id, operation, method, status, duration, user id, error code and category. Never note titles or content, headers or tokens — a test asserts this.

**24. What are the known security weaknesses?**
Not yet verified on real AWS; no MFA; throttling is per stage, not per user; sign-up reveals whether an e-mail is registered; the pagination token is unsigned (safe, but craftable within one's own data); access tokens remain valid until expiry after sign-out. All listed in `docs/security/SECURITY.md`.

## DynamoDB

**25. Why DynamoDB rather than a relational database?**
It is serverless (no instances, pay per request), scales automatically, and the access patterns are simple key lookups and one per-user list. The cost is that queries must be designed around keys — there are no joins or ad-hoc filters.

**26. Explain the key design.**
Table partition key `noteId`. Global secondary index `byUser` with partition key `userId` and sort key `createdAt#noteId`. Get/update/delete address the item by id; listing is a `Query` on the index, newest first.

**27. Why a GSI instead of `userId` as the partition key, as the report suggested for future work?**
With `userId` + `noteId` as the primary key, another user's note cannot be found by id at all, so the API could only answer 404 — contradicting the required 403. The index keeps lookup by id and still makes listing efficient. The cost is an extra write per create/delete and eventually consistent lists.

**28. The semestral design filtered in the application. What was wrong with that?**
It needs a `Scan`: every list reads every user's notes and discards most. Cost and latency grow with the whole table, and other users' data passes through the function. The index makes listing proportional to the page size.

**29. What does eventual consistency mean for users?**
The index is updated asynchronously, so a list immediately after a create may briefly miss the new note. Reads by id are strongly consistent. The frontend inserts the created note from the POST response, so users do not notice.

## Lambda and serverless trade-offs

**30. What is a cold start and how do you reduce it?**
Starting a new execution environment before the handler runs. Reduced by having no third-party dependencies, creating the boto3 resource once per environment (`runtime.py`), 256 MB memory and arm64. Provisioned concurrency would remove it but adds fixed cost.

**31. Why Python 3.13 when the semestral report said 3.11?**
3.13 is a newer supported Lambda runtime with a longer support window; nothing in the code depends on the difference. I verify the runtime's support status in the Lambda documentation before deploying (ADR 0007).

**32. Why a REST API and not the cheaper HTTP API?**
The thesis specifies a REST API with a Cognito authorizer. REST APIs also allow custom gateway responses, so 401/403/429 share the application's JSON error format, and offer stage throttling. The HTTP API is roughly three times cheaper per request, which would matter at millions of requests (ADR 0001).

## Testing

**33. How was the system tested?**
187 backend tests (unit, integration against an in-memory DynamoDB emulator, security, template checks), 66 frontend tests and 14 browser end-to-end tests, all passing; coverage of backend logic about 99 %. On AWS (eu-north-1, 2026-11-17): a live suite of 38 checks against the deployed stack, all passing, plus a browser test of the AWS mode and a latency benchmark. The 13 cases from the semestral report are individual tests. Lint, strict type checking, dependency audits and template validation also pass. Outputs are in `evidence/`.

**34. What do those tests not prove?**
Anything that happens in real AWS services: API Gateway's JWT validation, Cognito flows, IAM, gateway responses, throttling, alarms. Mocked events only prove how Lambda reacts to claims. `scripts/testing/live_api_tests.py` covers this against a deployed stack; it passed 38/38 on 2026-11-17. Still not covered: token expiry, a token from another pool, reading a real verification e-mail.

**35. Was this deployed and measured on AWS?**
Yes: on 2026-11-17 to eu-north-1 (the account's organization policy does not allow Frankfurt). `make live-test`: 38/38 passed. Measured from Central Europe: median ≈ 120 ms per request end to end, of which ≈ 10–20 ms inside Lambda; cold start ≈ 0.75–0.95 s end to end after a fix that moved boto3 set-up into the Lambda init phase (it was ≈ 1.3 s before). Be ready to explain what the first deployment revealed (`docs/deployment/TROUBLESHOOTING.md`) and that the stage throttle behaves only approximately.

## Deployment and operations

**36. How is the system deployed, and how would you undo it?**
`sam validate`, `sam build`, `sam deploy` create a CloudFormation stack from the template; outputs configure the frontend. `sam delete` (wrapped in `scripts/cleanup/destroy.sh`) removes everything. CI runs on every push; deployment through GitHub Actions is manual, approval-gated and uses OIDC instead of stored keys.

**37. A user reports an error. How do you find the cause?**
Take the `requestId` from the error response, search the Lambda log groups with CloudWatch Logs Insights, read `status`, `errorCode` and `errorCategory`; for 5xx read the `unhandled_exception` entry with the stack trace. If nothing is logged, API Gateway rejected the request before Lambda. Steps are in `docs/deployment/TROUBLESHOOTING.md`.

## Performance, cost, future work

**38. What does it cost and how does it scale?**
Pay-per-use: roughly $1/month at thesis scale and about $27 for five million requests at list price, dominated by API Gateway requests (`AWS_COST_ANALYSIS.md`; unit prices need verification). All components scale automatically; the first limits are the configured stage throttle and the account's Lambda concurrency quota. Real latency figures must come from my own measurements on a deployed stack.

**39. How much of this did you write yourself?**
Answer honestly. A truthful version: "The repository began as an AI-assisted reference implementation. I studied it with the lessons in `docs/learning`, rebuilt the backend modules myself from an empty folder, deployed it to my own AWS account, ran the live tests and performed the measurements in this thesis. I can explain any file." Then make that true — rebuild it, deploy it, measure it. Check your faculty's rules on AI assistance and declare it as they require.

**40. What are the next extensions?**
Sharing notes between users (a real authorization model), search (OpenSearch or a different index), attachments in S3, a mobile client using the same API, per-user rate limits, multi-region deployment, and hosting the web client.
