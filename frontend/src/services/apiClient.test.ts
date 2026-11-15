import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient, isApiError, type ApiAuth } from './apiClient'
import { createNotesApi } from './notesApi'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeAuth(overrides: Partial<ApiAuth> = {}): ApiAuth {
  return {
    getAuthorizationHeader: vi.fn(async () => 'Bearer token-1'),
    refreshAfterUnauthorized: vi.fn(async () => false),
    expireSession: vi.fn(),
    ...overrides,
  }
}

function setup(fetchImpl: typeof fetch, auth: ApiAuth = makeAuth()) {
  const client = createApiClient({ baseUrl: 'https://api.example/dev', auth, fetchImpl })
  return { client, auth, notes: createNotesApi(client) }
}

describe('api client', () => {
  it('sends the Authorization header and JSON body, and unwraps data', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(201, { data: { noteId: 'n1', title: 't' } }))
    const { notes } = setup(fetchImpl)
    const note = await notes.create({ title: 't', content: 'c' })
    expect(note.noteId).toBe('n1')
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.example/dev/notes')
    const headers = new Headers(init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer token-1')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ title: 't', content: 'c' }))
  })

  it('builds list queries and returns pagination metadata', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(200, { data: [], meta: { count: 0, limit: 5, nextToken: 'abc' } }),
    )
    const { notes } = setup(fetchImpl)
    const page = await notes.list({ limit: 5, nextToken: 'tok en' })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example/dev/notes?limit=5&nextToken=tok+en')
    expect(page.meta.nextToken).toBe('abc')
  })

  it('parses the error envelope into a typed ApiError', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The title field is required',
          requestId: 'req-1',
          details: [{ field: 'title', issue: 'is required' }],
        },
      }),
    )
    const { notes } = setup(fetchImpl)
    const error = await notes.create({ title: '', content: '' }).catch((e: unknown) => e)
    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'req-1',
      details: [{ field: 'title', issue: 'is required' }],
    })
  })

  it('maps non-envelope error bodies (e.g. API Gateway defaults) to a fallback code', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(429, { message: 'Too Many Requests' }))
    const error = await setup(fetchImpl).notes.list().catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 429, code: 'THROTTLED', message: 'Too Many Requests' })
  })

  it('reports network failures without inventing a response', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { client, notes } = setup(fetchImpl)
    const error = await notes.list().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ kind: 'network', status: 0, code: 'NETWORK_ERROR' })
    const exchange = await client.send({ method: 'GET', path: '/notes' })
    expect(exchange.ok).toBe(false)
    expect(exchange.status).toBe(0)
  })

  it('after a 401 refreshes once and retries with the new credential', async () => {
    let token = 'Bearer old'
    const auth = makeAuth({
      getAuthorizationHeader: vi.fn(async () => token),
      refreshAfterUnauthorized: vi.fn(async () => {
        token = 'Bearer new'
        return true
      }),
    })
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer new'
        ? jsonResponse(200, { data: [] })
        : jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Authentication is required' } }),
    )
    await setup(fetchImpl, auth).notes.list()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(auth.expireSession).not.toHaveBeenCalled()
  })

  it('expires the session when a 401 cannot be recovered', async () => {
    const auth = makeAuth()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(401, { message: 'Unauthorized' }))
    const error = await setup(fetchImpl, auth).notes.list().catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(auth.expireSession).toHaveBeenCalledTimes(1)
  })

  it('explorer mode: can omit credentials, never exposes them, and measures duration', async () => {
    const auth = makeAuth()
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'x' } }))
    let clock = 1000
    const client = createApiClient({
      baseUrl: 'https://api.example/dev/',
      auth,
      fetchImpl,
      now: () => (clock += 25),
    })
    const exchange = await client.send({ method: 'GET', path: '/notes', auth: 'none', recoverSession: false })
    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false)
    expect(exchange.authorizationSent).toBe(false)
    expect(exchange.status).toBe(401)
    expect(exchange.durationMs).toBeGreaterThan(0)
    expect(auth.expireSession).not.toHaveBeenCalled()

    const withAuth = await client.send({ method: 'GET', path: '/notes', recoverSession: false })
    expect(withAuth.authorizationSent).toBe(true)
    expect(JSON.stringify(withAuth)).not.toContain('token-1')
  })

  it('sends a raw body verbatim', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(400, { error: { code: 'MALFORMED_JSON', message: 'bad' } }))
    const { client } = setup(fetchImpl)
    const exchange = await client.send({ method: 'POST', path: '/notes', rawBody: '{not json' })
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toBe('{not json')
    expect(exchange.error?.code).toBe('MALFORMED_JSON')
  })
})
