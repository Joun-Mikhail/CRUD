import type { ErrorEnvelope, FieldIssue, HttpMethod } from '../types/api'

/** What the client needs from the authentication layer (implemented by every AuthService). */
export interface ApiAuth {
  /** Current `Authorization` header value, or null when signed out. */
  getAuthorizationHeader(): Promise<string | null>
  /** Called after a 401: try to obtain fresh credentials. Resolves true if a retry makes sense. */
  refreshAfterUnauthorized(): Promise<boolean>
  /** Called when the API keeps answering 401: the session is over. */
  expireSession(): void
}

export type ApiErrorKind = 'http' | 'network' | 'invalid-response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  /** HTTP status; 0 when no response was received. */
  readonly status: number
  readonly code: string
  readonly requestId: string | null
  readonly details: FieldIssue[] | undefined

  constructor(init: {
    kind: ApiErrorKind
    status: number
    code: string
    message: string
    requestId?: string | null
    details?: FieldIssue[]
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.kind = init.kind
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    this.details = init.details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export interface RequestOptions {
  method: HttpMethod
  /** Path below the base URL, e.g. `/notes`. */
  path: string
  query?: Record<string, string | number | undefined | null>
  /** JSON-serialisable body. */
  body?: unknown
  /** Pre-serialised body, sent verbatim (API explorer). Takes precedence over `body`. */
  rawBody?: string
  /** `none` omits the Authorization header (API explorer: demonstrate a 401). */
  auth?: 'default' | 'none'
  /** On 401: refresh once and retry, then expire the session. Default true. */
  recoverSession?: boolean
  signal?: AbortSignal
}

/** Everything observable about one HTTP exchange (shown by the API explorer). */
export interface Exchange {
  method: HttpMethod
  url: string
  /** Request headers as sent, except Authorization, which is never exposed here. */
  requestHeaders: Record<string, string>
  authorizationSent: boolean
  requestBody: string | null
  /** HTTP status; 0 when no response was received. */
  status: number
  ok: boolean
  /** Client-measured wall time from send to fully parsed body. */
  durationMs: number
  /** Parsed JSON body, or null if the body was empty or not JSON. */
  json: unknown
  /** Raw text when the body was not valid JSON. */
  text: string | null
  error: ApiError | null
}

export interface ApiClient {
  readonly baseUrl: string
  buildUrl(path: string, query?: RequestOptions['query']): string
  /** Never rejects (except on abort): failures are described in `Exchange.error`. */
  send(options: RequestOptions): Promise<Exchange>
  /** Resolves with the parsed JSON body of a 2xx response; rejects with ApiError otherwise. */
  request<T>(options: RequestOptions): Promise<T>
}

export interface ApiClientDeps {
  baseUrl: string
  auth: ApiAuth
  fetchImpl?: typeof fetch
  now?: () => number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEnvelope(json: unknown): ErrorEnvelope['error'] | null {
  if (!isRecord(json) || !isRecord(json.error)) return null
  const { code, message, requestId, details } = json.error
  if (typeof code !== 'string' || typeof message !== 'string') return null
  const issues = Array.isArray(details)
    ? details.filter(
        (item): item is FieldIssue =>
          isRecord(item) && typeof item.field === 'string' && typeof item.issue === 'string',
      )
    : undefined
  return {
    code,
    message,
    requestId: typeof requestId === 'string' ? requestId : undefined,
    details: issues?.length ? issues : undefined,
  }
}

const FALLBACK_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'THROTTLED',
  503: 'SERVICE_UNAVAILABLE',
}

function httpError(status: number, json: unknown): ApiError {
  const envelope = parseEnvelope(json)
  if (envelope) {
    return new ApiError({ kind: 'http', status, ...envelope })
  }
  // e.g. an API Gateway default response ({"message": "..."}) or a proxy error page.
  const message = isRecord(json) && typeof json.message === 'string' ? json.message : null
  return new ApiError({
    kind: 'http',
    status,
    code: FALLBACK_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
    message: message ?? `The server answered with HTTP ${status}.`,
  })
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const baseUrl = deps.baseUrl.replace(/\/+$/, '')
  const now = deps.now ?? (() => performance.now())
  // Looked up per call so tests can stub the global.
  const doFetch: typeof fetch = (input, init) => (deps.fetchImpl ?? globalThis.fetch)(input, init)

  function buildUrl(path: string, query?: RequestOptions['query']): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
    }
    const suffix = params.size ? `?${params.toString()}` : ''
    return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}${suffix}`
  }

  async function exchangeOnce(options: RequestOptions): Promise<Exchange> {
    const url = buildUrl(options.path, options.query)
    const requestBody =
      options.rawBody ?? (options.body === undefined ? null : JSON.stringify(options.body))
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
    const authorization =
      options.auth === 'none' ? null : await deps.auth.getAuthorizationHeader()
    const base = {
      method: options.method,
      url,
      requestHeaders,
      authorizationSent: authorization !== null,
      requestBody,
    }

    const started = now()
    let response: Response
    let text: string
    try {
      response = await doFetch(url, {
        method: options.method,
        headers: authorization ? { ...requestHeaders, Authorization: authorization } : requestHeaders,
        body: requestBody,
        signal: options.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
      text = await response.text()
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
      return {
        ...base,
        status: 0,
        ok: false,
        durationMs: Math.round(now() - started),
        json: null,
        text: null,
        error: new ApiError({
          kind: 'network',
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'The API could not be reached. Check your connection and that the backend is running.',
        }),
      }
    }
    const durationMs = Math.round(now() - started)

    let json: unknown = null
    let invalidJson = false
    if (text.trim() !== '') {
      try {
        json = JSON.parse(text)
      } catch {
        invalidJson = true
      }
    }

    let error: ApiError | null = null
    if (!response.ok) {
      error = httpError(response.status, json)
    } else if (invalidJson) {
      error = new ApiError({
        kind: 'invalid-response',
        status: response.status,
        code: 'INVALID_RESPONSE',
        message: 'The API returned a response that is not valid JSON.',
      })
    }
    return {
      ...base,
      status: response.status,
      ok: response.ok && !invalidJson,
      durationMs,
      json,
      text: invalidJson ? text : null,
      error,
    }
  }

  async function send(options: RequestOptions): Promise<Exchange> {
    const exchange = await exchangeOnce(options)
    const recover = options.recoverSession !== false && options.auth !== 'none'
    if (exchange.status !== 401 || !recover) return exchange
    if (await deps.auth.refreshAfterUnauthorized()) {
      const retried = await exchangeOnce(options)
      if (retried.status !== 401) return retried
      deps.auth.expireSession()
      return retried
    }
    deps.auth.expireSession()
    return exchange
  }

  async function request<T>(options: RequestOptions): Promise<T> {
    const exchange = await send(options)
    if (exchange.error) throw exchange.error
    return exchange.json as T
  }

  return { baseUrl, buildUrl, send, request }
}
