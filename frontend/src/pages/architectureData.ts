export type ComponentId = 'browser' | 'cognito' | 'apigw' | 'lambda' | 'dynamodb' | 'cloudwatch'

export interface ArchComponent {
  id: ComponentId
  name: string
  kind: string
  summary: string
  does: string[]
  checks: string[]
  files: string[]
}

export const COMPONENTS: Record<ComponentId, ArchComponent> = {
  browser: {
    id: 'browser',
    name: 'Browser',
    kind: 'React single-page app',
    summary: 'The user interface you are looking at. It holds no data of its own and calls the REST API for everything.',
    does: [
      'Signs the user in through Cognito (Authorization Code flow with PKCE) and keeps the tokens in memory only.',
      'Sends every request with the header Authorization: Bearer <access token>.',
      'Validates forms before sending, but never relies on that for security.',
    ],
    checks: ['Nothing that matters for security: every rule is enforced again on the server.'],
    files: ['frontend/src/services/apiClient.ts', 'frontend/src/services/auth/cognitoAuth.ts'],
  },
  cognito: {
    id: 'cognito',
    name: 'Amazon Cognito',
    kind: 'User pool (identity provider)',
    summary: 'The managed user directory. It registers users, verifies e-mail addresses, checks passwords and issues signed JSON Web Tokens.',
    does: [
      'Stores accounts and password hashes, so the application never handles passwords.',
      'Issues an access token (who you are, which scopes you hold, when it expires) signed with RS256.',
      'Publishes the public keys (JWKS) that API Gateway uses to verify the signature.',
    ],
    checks: ['E-mail ownership (verification code).', 'Password policy: 12+ characters, upper, lower, number, symbol.'],
    files: ['infrastructure/template.yaml (UserPool, WebClient, NotesResourceServer, UserPoolDomain)'],
  },
  apigw: {
    id: 'apigw',
    name: 'API Gateway',
    kind: 'REST API + Cognito authorizer',
    summary: 'The public HTTPS front door. It rejects unauthenticated requests before any of our code runs.',
    does: [
      'Routes POST/GET /notes and GET/PUT/DELETE /notes/{id} to the matching Lambda function.',
      'Throttles the stage (10 requests/s, burst 20) and answers 429 above that.',
      'Answers CORS preflight requests for the configured origin only.',
    ],
    checks: [
      'Token signature, issuer and expiry.',
      'That it is an access token carrying the required scope: notes/read or notes/write.',
    ],
    files: ['infrastructure/template.yaml (NotesApi, GatewayResponses)'],
  },
  lambda: {
    id: 'lambda',
    name: 'AWS Lambda',
    kind: '5 Python functions',
    summary: 'The business logic: CreateNote, ListNotes, GetNote, UpdateNote and DeleteNote. Each runs only when called and may use only the one DynamoDB action it needs.',
    does: [
      'Reads the verified user id (sub claim) from the event that API Gateway passes in.',
      'Validates input, generates noteId and timestamps, applies ownership rules.',
      'Writes one structured JSON log line per request.',
    ],
    checks: [
      'Request body: types, lengths, unknown fields (400).',
      'Ownership: the note must belong to the caller (403), and exist (404).',
      'Optimistic locking: a stale version is refused (409).',
    ],
    files: [
      'backend/src/notes_api/handlers/',
      'backend/src/notes_api/operations.py',
      'backend/src/notes_api/services/notes_service.py',
      'backend/src/notes_api/validation/notes.py',
    ],
  },
  dynamodb: {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    kind: 'NoSQL table + index',
    summary: 'The managed database. One table keyed by noteId, plus the byUser index that lists one user’s notes with a Query instead of a Scan.',
    does: [
      'Stores each note as one item: noteId, userId, title, content, createdAt, updatedAt, version.',
      'Index byUser: partition key userId, sort key createdAt#noteId (newest first, paginated).',
      'Bills per request (on-demand), so an idle table costs almost nothing.',
    ],
    checks: [
      'Condition expressions make “is this the owner?” and “write” one atomic step, so there is no race window.',
    ],
    files: ['backend/src/notes_api/repositories/notes_repository.py', 'infrastructure/template.yaml (NotesTable)'],
  },
  cloudwatch: {
    id: 'cloudwatch',
    name: 'Amazon CloudWatch',
    kind: 'Logs, metrics, alarms',
    summary: 'Observability. It is not on the request path: Lambda and API Gateway send logs and metrics to it on the side.',
    does: [
      'Keeps the JSON log lines (request id, operation, status, duration) for 14 days.',
      'Raises alarms on API 5xx responses, slow responses, Lambda errors and DynamoDB throttling.',
    ],
    checks: ['Nothing about a request — it only records what happened so you can investigate.'],
    files: ['backend/src/notes_api/logging_utils.py', 'infrastructure/template.yaml (alarms, log groups)'],
  },
}

export const REQUEST_PATH: ComponentId[] = ['browser', 'apigw', 'lambda', 'dynamodb']

export interface WalkthroughStep {
  at: ComponentId
  title: string
  detail: string
}

/** One authorized POST /notes, step by step. */
export const WALKTHROUGH: WalkthroughStep[] = [
  { at: 'cognito', title: 'Sign in', detail: 'Earlier, the user signed in on the Cognito page. Cognito returned an access token to the browser.' },
  { at: 'browser', title: 'Send the request', detail: 'The app sends POST /notes with the JSON body {title, content} and the header Authorization: Bearer <access token>.' },
  { at: 'apigw', title: 'Authenticate', detail: 'API Gateway verifies the token signature with Cognito’s public keys, checks that it has not expired and that it carries the notes/write scope. If not: 401, and Lambda never runs.' },
  { at: 'lambda', title: 'Identify and validate', detail: 'CreateNote reads the user id from the verified claims — never from the body — then validates title and content. Invalid input ends here with 400.' },
  { at: 'lambda', title: 'Build the note', detail: 'The service generates a UUID, sets userId to the caller, and stamps createdAt = updatedAt = now (UTC), version = 1.' },
  { at: 'dynamodb', title: 'Store it', detail: 'PutItem with the condition attribute_not_exists(noteId): an existing note can never be overwritten by accident.' },
  { at: 'lambda', title: 'Respond and log', detail: 'The function returns 201 with {"data": note} and writes one JSON log line (request id, status, duration) — without the note text.' },
  { at: 'cloudwatch', title: 'Observe', detail: 'The log line and the request metrics land in CloudWatch, where the request id lets you find this exact request later.' },
  { at: 'browser', title: 'Show the result', detail: 'API Gateway relays the 201 response; the app adds the new note to the list.' },
]
