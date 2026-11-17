# Project summary for the supervisor

**Serverless CRUD API with Authentication** · John Heshmat (256986) · supervisor doc. Ing. Lukáš Malina, Ph.D. · status 17. 11. 2026

## What was built

A private-notes service: users register and sign in with Amazon Cognito and create, list, read, update and delete their own notes through a REST API. Amazon API Gateway verifies the JWT access token and its OAuth scope, five Python 3.13 AWS Lambda functions (one per operation) validate the request and enforce ownership, and Amazon DynamoDB stores the notes, with a per-user secondary index for listing. CloudWatch holds structured logs and four alarms. The whole backend is one AWS SAM template, deployed in eu-north-1 (Stockholm). A React web client is published at **https://d11c0a7q5fx9qi.cloudfront.net** (private S3 bucket behind CloudFront, HTTPS).

## Why this architecture

- Only managed, pay-per-use services: no servers to operate, automatic scaling, near-zero idle cost (≈ USD 1/month at list price for demonstration use, covered by the account's Free plan credits).
- Token verification and scope checks happen at the gateway, before any code runs; ownership is checked inside the database write, so it cannot race.
- One function per operation lets each IAM role allow exactly one DynamoDB action.
- Everything is code and is deployed through reviewed CloudFormation change sets, so the system can be rebuilt from the repository.
- Stockholm instead of Frankfurt: the AWS account's organization policy denies Frankfurt.

## What was tested and the results

| Test | Result |
|---|---|
| Backend unit, integration and security tests | 193 passed, 99 % coverage |
| Frontend unit and browser tests | 66 + 14 passed |
| Live tests on AWS (the report's 13 cases + authentication, scopes, isolation, validation, CORS, throttling) | 38/38 passed |
| Browser test of the public site | sign-in (PKCE), CRUD, reload, sign-out; no tokens in browser storage |
| Benchmark, 500 sequential requests | 100 % success, median ≈ 120 ms end to end; Lambda ≈ 10–14 ms warm |
| Manual check by the author with a real mailbox | registration, e-mailed code, sign-in, password reset, CRUD |

Raw outputs are in the repository's `evidence/` directory.

## Status against the assignment

- Semestral items 1–3: **complete**; the written report exists as a draft under author review (`docs/thesis/SEMESTRAL_REPORT.md`).
- Bachelor item 4 (full backend, user management, logging, monitoring): **largely implemented and deployed**.
- Bachelor item 5 (evaluation): **begun** — functionality measured; performance measured for one client; scalability, security depth and real costs still open.

## What remains for the bachelor's thesis

Concurrent load test and scalability analysis; comparison of the cost model with the real bill; expired-token and foreign-issuer tests and alarm notifications; optional hardening (MFA, per-user rate limiting, SES, backups); a measured comparison with a server-based solution; discussion of a mobile client and integrations.

## Known limitations

No MFA or WAF; throttling per stage, not per user; 403 for another user's note reveals that the id exists (required by the assignment); access tokens stay valid until expiry after sign-out; development stage without backups; default CloudFront domain.

## How to see it

Open the public URL, sign in, create/edit/delete a note; the 10-minute script is in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md). Source: https://github.com/Joun-Mikhail/CRUD.

## Use of AI

The implementation and documentation were developed with the AI coding assistant Claude Code; the report draft was AI-assisted and is being reviewed and rewritten by the author. The wording of the AI disclosure will be agreed with the supervisor.
