# Architecture

Everything in this document describes what is implemented in this repository. Region: `eu-central-1` (Frankfurt). All diagrams are Mermaid (GitHub renders them).

## 1. System overview

```mermaid
flowchart LR
    U[Browser<br/>React SPA] -- "1. sign up / sign in<br/>(Authorization Code + PKCE)" --> C[Amazon Cognito<br/>user pool + hosted login]
    C -- "2. access token (JWT)" --> U
    U -- "3. HTTPS + Authorization: Bearer" --> G[API Gateway<br/>REST API + Cognito authorizer]
    G -. "verifies signature with<br/>Cognito public keys (JWKS)" .-> C
    G -- "4. invoke (proxy event)" --> L[AWS Lambda<br/>5 Python functions]
    L -- "5. GetItem / PutItem / UpdateItem /<br/>DeleteItem / Query" --> D[(DynamoDB<br/>notes table + byUser index)]
    L -. "JSON logs, metrics" .-> W[CloudWatch<br/>logs, metrics, alarms]
    G -. "metrics" .-> W
    D -. "metrics" .-> W
```

| Component | Responsibility | Defined in |
|---|---|---|
| React SPA (`frontend/`) | UI, sign-in redirect, calls the REST API. Holds no data and enforces no security rule. | `frontend/src` |
| Cognito user pool | Accounts, password policy, e-mail verification, token issuing, hosted login page | `infrastructure/template.yaml` (`UserPool`, `WebClient`, `NotesResourceServer`, `UserPoolDomain`) |
| API Gateway REST API | HTTPS endpoint, routing, **authentication** (JWT + scope), throttling, CORS preflight, uniform gateway error bodies | `NotesApi` |
| Lambda functions | Validation, **authorization** (ownership), business rules, logging | `backend/src/notes_api`, `*Function` resources |
| DynamoDB | Durable storage; atomic conditional writes | `NotesTable` |
| CloudWatch | Log groups (14-day retention), 4 alarms, optional SNS e-mail | `*LogGroup`, `*Alarm` |

No VPC, NAT gateway, server or container is involved.

## 2. Backend layering

```mermaid
flowchart TD
    E[API Gateway event] --> H["handlers/*.py<br/>(one entry point per operation)"]
    H --> W["http.api_handler<br/>identity · scope · envelope · error mapping · logging"]
    W --> O["operations.py<br/>parse + validate request → call service → Result"]
    O --> V[validation/notes.py]
    O --> P[pagination.py]
    O --> S["services/notes_service.py<br/>ids · timestamps · ownership semantics"]
    S --> R["repositories/notes_repository.py<br/>the only code that talks to DynamoDB"]
    R --> DB[(DynamoDB)]
    RT["runtime.py<br/>composition root (settings, boto3, wiring)"] -.-> H
```

Rules: dependencies point downwards only; `operations` and `services` contain no AWS calls; the repository is behind a `Protocol`, so unit tests use an in-memory fake and integration tests use `moto`. Extending the API with a second entity means adding a model, repository, service, operations and handlers alongside the existing ones — nothing existing has to change.

## 3. User registration

```mermaid
sequenceDiagram
    actor User
    participant App as React app
    participant Cog as Cognito (cognito-idp API)
    User->>App: e-mail, password, confirmation
    App->>App: validate e-mail + password policy
    App->>Cog: SignUp(ClientId, Username=e-mail, Password)
    Cog-->>User: e-mail with 6-digit code
    Cog-->>App: UserConfirmed=false, masked destination
    User->>App: verification code
    App->>Cog: ConfirmSignUp(ClientId, Username, Code)
    Cog-->>App: OK
    App-->>User: "Account ready" → continue to sign in
```

## 4. Sign-in (OAuth 2.0 Authorization Code + PKCE)

```mermaid
sequenceDiagram
    actor User
    participant App as React app
    participant Hosted as Cognito hosted login
    participant Tok as Cognito /oauth2/token
    App->>App: create code_verifier + state (sessionStorage),<br/>code_challenge = BASE64URL(SHA-256(verifier))
    App->>Hosted: redirect /oauth2/authorize?response_type=code&client_id&scope&state&code_challenge&code_challenge_method=S256
    User->>Hosted: e-mail + password (the app never sees them)
    Hosted-->>App: redirect /auth/callback?code=…&state=…
    App->>App: check state matches; delete stored verifier/state
    App->>Tok: POST grant_type=authorization_code, code, code_verifier
    Tok-->>App: access token, ID token, refresh token
    App->>App: keep tokens in memory only; schedule refresh
```
The public client has no secret; PKCE binds the authorization code to the browser that started the flow.

## 5. Authorized API request

```mermaid
sequenceDiagram
    participant App as React app
    participant GW as API Gateway
    participant Fn as Lambda
    participant DB as DynamoDB
    App->>GW: GET /notes/{id} + Authorization: Bearer <access token>
    alt token missing / invalid / expired
        GW-->>App: 401 {"error":{"code":"UNAUTHORIZED",…}}  (Lambda not invoked)
    else token lacks notes/read
        GW-->>App: 401/403 (Lambda not invoked)
    else valid
        GW->>Fn: event with requestContext.authorizer.claims (sub, scope, …)
        Fn->>Fn: user id = claims.sub; validate {id} is a UUID
        Fn->>DB: GetItem(noteId) ConsistentRead
        alt no item
            Fn-->>App: 404 NOT_FOUND
        else item.userId ≠ caller
            Fn-->>App: 403 FORBIDDEN (no content, no owner disclosed)
        else owner
            Fn-->>App: 200 {"data": note}
        end
    end
```

## 6. Create a note

```mermaid
sequenceDiagram
    participant App
    participant GW as API Gateway
    participant Fn as CreateNote
    participant DB as DynamoDB
    participant CW as CloudWatch Logs
    App->>GW: POST /notes {title, content}
    GW->>Fn: proxy event (claims verified, scope notes/write)
    Fn->>Fn: parse JSON → validate (unknown fields, types, lengths)
    Fn->>Fn: noteId = uuid4(), userId = claims.sub,<br/>createdAt = updatedAt = now UTC, version = 1
    Fn->>DB: PutItem ConditionExpression attribute_not_exists(noteId)
    DB-->>Fn: OK
    Fn->>CW: {"message":"request_completed","operation":"CreateNote","status":201,"durationMs":…}
    Fn-->>App: 201 {"data": note}
```

## 7. Update a note (atomic ownership + optimistic locking)

```mermaid
sequenceDiagram
    participant Fn as UpdateNote
    participant DB as DynamoDB
    Fn->>DB: UpdateItem SET title, content, updatedAt ADD version 1<br/>Condition: attribute_exists(noteId) AND userId = :caller [AND version = :expected]<br/>ReturnValuesOnConditionCheckFailure = ALL_OLD
    alt condition true
        DB-->>Fn: new item → 200
    else condition false, no old item
        DB-->>Fn: ConditionalCheckFailed → 404
    else old item has another userId
        DB-->>Fn: ConditionalCheckFailed + old item → 403
    else version differs
        DB-->>Fn: ConditionalCheckFailed + old item → 409
    end
```
Because the ownership test is part of the write, there is no moment between "check" and "write" in which another request could slip in. Delete works the same way.

## 8. Data model and access paths

```mermaid
erDiagram
    NOTE {
        string noteId PK "UUID v4 — table partition key"
        string userId "Cognito sub — GSI byUser partition key"
        string userSortKey "createdAt#noteId — GSI byUser sort key"
        string title
        string content
        string createdAt "ISO-8601 UTC"
        string updatedAt "ISO-8601 UTC"
        number version
    }
```
| Operation | DynamoDB call | Key used |
|---|---|---|
| CreateNote | `PutItem` (conditional) | table: `noteId` |
| GetNote | `GetItem` (consistent) | table: `noteId` |
| UpdateNote | `UpdateItem` (conditional) | table: `noteId` |
| DeleteNote | `DeleteItem` (conditional) | table: `noteId` |
| ListNotes | `Query`, newest first, `Limit` | index `byUser`: `userId` |

Details and trade-offs: [`../database/DATABASE.md`](../database/DATABASE.md).

## 9. Deployment

```mermaid
flowchart LR
    T[infrastructure/template.yaml<br/>+ backend/src] -- sam build --> B[.aws-sam/build]
    B -- "sam deploy<br/>(upload to S3, change set)" --> CF[CloudFormation stack<br/>serverless-notes-dev]
    CF --> R1[API Gateway REST API + stage]
    CF --> R2[5 Lambda functions + IAM roles]
    CF --> R3[DynamoDB table + GSI]
    CF --> R4[Cognito pool, client, domain, resource server]
    CF --> R5[Log groups + alarms]
    CF -- outputs --> ENV[frontend/.env.aws]
```

## 10. CI/CD

```mermaid
flowchart TD
    PR[push / pull request] --> CI
    subgraph CI[".github/workflows/ci.yml"]
        A[backend: ruff · mypy · pytest+coverage · pip-audit]
        F[frontend: eslint · tsc · vitest · build · npm audit]
        E[e2e: Playwright against Local Demo]
        I[infrastructure: cfn-lint · sam validate · sam build]
        A --> E
        F --> E
    end
    M[manual: Run workflow] --> D
    subgraph D[".github/workflows/deploy.yml"]
        G[environment approval] --> O[OIDC → short-lived AWS role] --> S[sam deploy] --> LT[live_api_tests.py]
    end
```
Nothing deploys automatically. The deploy workflow uses GitHub OIDC; no AWS keys are stored.

## 11. Error handling and observability

```mermaid
flowchart TD
    Req[Request] --> GW{API Gateway}
    GW -- "auth / throttle / unknown route" --> GR["GatewayResponse<br/>401 · 403 · 404 · 429 · 413<br/>same JSON envelope + requestId"]
    GW --> L[Lambda api_handler]
    L -- AppError --> E4["4xx/503 envelope<br/>code · message · requestId · details"]
    L -- "any other exception" --> E5["500 INTERNAL_ERROR (generic)<br/>stack trace → log only"]
    L -- success --> OK["2xx {data}"]
    L --> LOG["one JSON line per request:<br/>requestId · operation · status · durationMs · userId · errorCode · errorCategory"]
    LOG --> CWL[(CloudWatch Logs)]
    GW --> MET[(CloudWatch metrics)]
    MET --> AL{{Alarms: API 5xx · p95 latency ·<br/>Lambda errors · DynamoDB throttles}}
    AL -. optional .-> SNS[SNS e-mail]
```
How to investigate a failed request: [`../deployment/TROUBLESHOOTING.md`](../deployment/TROUBLESHOOTING.md).

## Differences from the semestral report

See [`../REQUIREMENTS.md`](../REQUIREMENTS.md) for the full comparison. In short: five single-purpose functions instead of three; a `byUser` index instead of application-level filtering; infrastructure as code instead of console configuration; Python 3.13 instead of 3.11; S3 (shown in the report's Figure 1) is not used because nothing needs it.
