# Serverless Notes — frontend

React 19 + TypeScript (strict) + Vite + Tailwind CSS 4. No UI framework, no state library, no AWS SDK.

## Modes

| | Local Demo (`npm run dev`) | AWS (`npm run dev:aws`) |
|---|---|---|
| Config file | `.env.demo` (committed) | `.env.aws` (git-ignored; `make frontend-env` or copy `.env.aws.example`) |
| Backend | `backend/local_demo/server.py` on :8787 — real handlers, in-memory DynamoDB | deployed API Gateway |
| Sign-in | pick a simulated identity (Alice/Bob/Carol) — no password, no token | Cognito: in-app sign-up, e-mail verification and password reset; sign-in on the hosted page with Authorization Code + PKCE |
| Indicator | yellow banner + "Local Demo" badge | "AWS" badge |

The mode is fixed at build time by `VITE_APP_MODE`. A missing or incomplete configuration shows a configuration-error screen; the app never falls back to another mode, and never invents data when the backend is unreachable.

| Variable | Mode | Meaning |
|---|---|---|
| `VITE_APP_MODE` | both | `demo` or `aws` |
| `VITE_API_BASE_URL` | both | API base URL (https required in aws mode) |
| `VITE_AWS_REGION`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN` | aws | stack outputs |
| `VITE_OAUTH_REDIRECT_URI`, `VITE_OAUTH_LOGOUT_URI`, `VITE_OAUTH_SCOPES` | aws | optional overrides |

None of these is a secret.

## Scripts

`npm run dev` · `dev:aws` · `build` (demo) · `build:aws` · `preview` · `typecheck` · `lint` · `test` (vitest) · `test:e2e` (Playwright; starts backend + Vite itself) · `screenshots` (writes `../evidence/screenshots/`).

## Structure

```
src/
  main.tsx, routes.tsx      entry point and route table
  config.ts                 validates VITE_* variables
  services/
    apiClient.ts            one request function: auth header, JSON, typed ApiError, 401 recovery, timing
    notesApi.ts             the five endpoints
    auth/                   AuthService interface; demoAuth.ts; cognitoAuth.ts (PKCE, in-memory tokens, refresh)
    cognito/                idp.ts (SignUp, ConfirmSignUp, ForgotPassword, ConfirmForgotPassword), oauth.ts (authorize/token/revoke/logout)
  components/ui/            Button, Field, Dialog (focus trap), Card, Badge, Skeleton, Empty/Error states, toasts
  components/providers/     configuration, theme, toasts, auth, notes state
  layouts/                  AppLayout (sidebar / mobile drawer / top bar), RequireAuth
  pages/                    Auth, Dashboard, Notes, NoteEditor, Architecture, ApiExplorer, Settings
  pages/lab/                LabProof Lite: LabHomePage (/lab), ExperimentEditorPage (/lab/new, /lab/:id), LabReportPage (/lab/:id/report)
  lab/                      LabProof logic and parts: ohmsLaw.ts (calculations), experimentFormat.ts (JSON in note.content),
                            ReadingsTable, ResultSummary, VIChart (SVG graph), LabHero, useExperimentNote
  utils/                    pkce, jwt (display only), validation mirror, formatting
tests/e2e/                  Playwright journeys, axe accessibility audit, screenshot capture
csp.ts                      builds the Content-Security-Policy injected into index.html
```

## Security notes

- Access, ID and refresh tokens are kept **in memory only**. `sessionStorage` holds the PKCE verifier and `state` during the redirect (deleted on return) and a non-sensitive "was signed in" flag.
- The API receives the **access** token. The ID token is decoded only to display the e-mail address; nothing is trusted from it.
- Tokens are never rendered or logged; the API explorer shows `Bearer eyJ…(redacted)`.
- Production CSP: `script-src 'self'; style-src 'self'; connect-src` limited to the configured API and Cognito origins. No inline scripts or styles.
- All authorization is enforced by the backend. Client-side checks are for usability only.

## Verification

LabProof Lite (Ohm's law experiments stored as versioned JSON notes, printable report): the original LabProof run recorded 106 unit/component tests and 17 browser tests against the Local Demo (`evidence/tests/labproof-frontend-*.txt`); the final-release figures are in `docs/FINAL_PROJECT_STATUS.md`. The LabProof screens have not been exercised against AWS by an automated test. Run browser tests with `npx playwright test --project=chromium`: the `screenshots` project rewrites the tracked images in `evidence/screenshots/`. Guide: `docs/learning/LABPROOF_FOR_BEGINNERS.md`.

Before LabProof: 66 unit/component tests and 14 browser tests (including an axe accessibility audit in both themes) pass against the Local Demo; the production build was smoke-tested under its CSP. AWS mode was tested in a real browser against the deployed stack and the public CloudFront site on 2026-11-17 (`docs/testing/TESTING.md`).
