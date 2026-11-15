import { describe, expect, it, vi } from 'vitest'
import type { CognitoConfig } from '../../types/config'
import { CognitoError, createCognitoIdp } from '../cognito/idp'
import { CognitoAuthService, PENDING_KEY, safeReturnPath, WAS_SIGNED_IN_KEY } from './cognitoAuth'
import { DemoAuthService } from './demoAuth'

const CONFIG: CognitoConfig = {
  region: 'eu-central-1',
  userPoolId: 'eu-central-1_Pool',
  clientId: 'client-1',
  domain: 'https://notes.auth.eu-central-1.amazoncognito.com',
  redirectUri: 'http://localhost:5173/auth/callback',
  logoutUri: 'http://localhost:5173/',
  scopes: ['openid', 'email', 'notes/read', 'notes/write'],
}

function jwt(payload: Record<string, unknown>): string {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`
}

const ACCESS = jwt({ sub: 'user-1', token_use: 'access', scope: 'notes/read notes/write' })
const ID = jwt({ sub: 'user-1', token_use: 'id', email: 'student@vut.cz' })

function tokenResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({ access_token: ACCESS, id_token: ID, refresh_token: 'refresh-1', expires_in: 3600, token_type: 'Bearer', ...overrides }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function setup(fetchImpl: typeof fetch = vi.fn<typeof fetch>(async () => tokenResponse())) {
  const redirect = vi.fn<(url: string) => void>()
  const service = new CognitoAuthService({
    config: CONFIG,
    storage: window.sessionStorage,
    redirect,
    currentPath: () => '/notes',
    fetchImpl,
  })
  return { service, redirect, fetchImpl }
}

async function signIn(context: ReturnType<typeof setup>): Promise<string> {
  await context.service.startSignIn({ loginHint: 'student@vut.cz', returnTo: '/notes/new' })
  const authorizeUrl = new URL(context.redirect.mock.calls[0]?.[0] ?? '')
  const state = authorizeUrl.searchParams.get('state') ?? ''
  return context.service.completeSignIn(new URLSearchParams({ code: 'auth-code', state }))
}

describe('CognitoAuthService (Authorization Code + PKCE)', () => {
  it('builds a correct authorize redirect', async () => {
    const context = setup()
    await context.service.startSignIn({ loginHint: 'student@vut.cz' })
    const url = new URL(context.redirect.mock.calls[0]?.[0] ?? '')
    expect(url.origin + url.pathname).toBe(`${CONFIG.domain}/oauth2/authorize`)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-1')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri)
    expect(url.searchParams.get('scope')).toBe('openid email notes/read notes/write')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9\-_]{43}$/)
    expect(url.searchParams.get('login_hint')).toBe('student@vut.cz')
    expect(url.searchParams.get('state')?.length).toBeGreaterThanOrEqual(24)
  })

  it('exchanges the code with the PKCE verifier and signs the user in', async () => {
    const context = setup()
    const returnTo = await signIn(context)
    expect(returnTo).toBe('/notes/new')

    const [url, init] = vi.mocked(context.fetchImpl).mock.calls[0] ?? []
    expect(url).toBe(`${CONFIG.domain}/oauth2/token`)
    const form = new URLSearchParams(String(init?.body))
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth-code')
    expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9\-_]{43,128}$/)

    const snapshot = context.service.getSnapshot()
    expect(snapshot.status).toBe('signedIn')
    expect(snapshot.user).toMatchObject({ id: 'user-1', email: 'student@vut.cz' })
    expect(snapshot.expiresAt).toBeGreaterThan(Date.now())
    // The API receives the ACCESS token, never the ID token.
    expect(await context.service.getAuthorizationHeader()).toBe(`Bearer ${ACCESS}`)
  })

  it('never writes tokens to browser storage and never renders them', async () => {
    const context = setup()
    await signIn(context)
    const stored = JSON.stringify({ ...window.sessionStorage }) + JSON.stringify({ ...window.localStorage })
    for (const secret of [ACCESS, ID, 'refresh-1']) expect(stored).not.toContain(secret)
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull() // verifier removed after use
    expect(window.sessionStorage.getItem(WAS_SIGNED_IN_KEY)).toBe('1')
    const described = context.service.describeAuthorization() ?? ''
    expect(described).toMatch(/^Bearer /)
    expect(described).not.toContain(ACCESS)
    expect(JSON.stringify(context.service.getSnapshot())).not.toContain(ACCESS)
  })

  it('rejects a callback whose state does not match (CSRF protection)', async () => {
    const context = setup()
    await context.service.startSignIn()
    await expect(
      context.service.completeSignIn(new URLSearchParams({ code: 'auth-code', state: 'attacker-state' })),
    ).rejects.toMatchObject({ code: 'state_mismatch' })
    expect(context.fetchImpl).not.toHaveBeenCalled()
    expect(context.service.getSnapshot().status).not.toBe('signedIn')
  })

  it('rejects callbacks without a pending request and surfaces provider errors', async () => {
    const context = setup()
    await expect(
      context.service.completeSignIn(new URLSearchParams({ code: 'c', state: 's' })),
    ).rejects.toMatchObject({ code: 'no_pending_request' })
    await expect(
      context.service.completeSignIn(new URLSearchParams({ error: 'access_denied' })),
    ).rejects.toMatchObject({ code: 'access_denied' })
  })

  it('refreshes after a 401 using the in-memory refresh token', async () => {
    const newAccess = jwt({ sub: 'user-1', token_use: 'access', n: 2 })
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(tokenResponse({ access_token: newAccess, refresh_token: undefined }))
    const context = setup(fetchImpl)
    await signIn(context)
    expect(await context.service.refreshAfterUnauthorized()).toBe(true)
    const form = new URLSearchParams(String(fetchImpl.mock.calls[1]?.[1]?.body))
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe('refresh-1')
    expect(await context.service.getAuthorizationHeader()).toBe(`Bearer ${newAccess}`)
  })

  it('expires the session when refreshing fails', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))
    const context = setup(fetchImpl)
    await signIn(context)
    expect(await context.service.refreshAfterUnauthorized()).toBe(false)
    context.service.expireSession()
    expect(context.service.getSnapshot()).toMatchObject({ status: 'signedOut', user: null, notice: 'session-expired' })
    expect(await context.service.getAuthorizationHeader()).toBeNull()
    expect(window.sessionStorage.getItem(WAS_SIGNED_IN_KEY)).toBeNull()
  })

  it('only accepts same-origin return paths', () => {
    expect(safeReturnPath('/notes/1')).toBe('/notes/1')
    for (const bad of ['https://evil.example', '//evil.example', '/auth/callback', 42, undefined])
      expect(safeReturnPath(bad)).toBe('/')
  })
})

describe('Cognito sign-up API', () => {
  function idpWith(response: Response) {
    const fetchImpl = vi.fn<typeof fetch>(async () => response)
    return { idp: createCognitoIdp({ region: 'eu-central-1', clientId: 'client-1', fetchImpl }), fetchImpl }
  }

  it('calls SignUp with the public client id', async () => {
    const { idp, fetchImpl } = idpWith(
      new Response(JSON.stringify({ UserConfirmed: false, CodeDeliveryDetails: { Destination: 's***@v***' } }), { status: 200 }),
    )
    const result = await idp.signUp('student@vut.cz', 'Correct-Horse-9')
    expect(result).toEqual({ userConfirmed: false, codeDestination: 's***@v***' })
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://cognito-idp.eu-central-1.amazonaws.com/')
    expect(new Headers(init?.headers).get('X-Amz-Target')).toBe('AWSCognitoIdentityProviderService.SignUp')
    expect(JSON.parse(String(init?.body))).toMatchObject({ ClientId: 'client-1', Username: 'student@vut.cz' })
  })

  it.each([
    ['UsernameExistsException', /already/i],
    ['CodeMismatchException', /not correct/i],
    ['ExpiredCodeException', /expired/i],
    ['LimitExceededException', /too many/i],
  ])('maps %s to a friendly message', async (type, pattern) => {
    const { idp } = idpWith(new Response(JSON.stringify({ __type: type, message: 'raw aws text' }), { status: 400 }))
    const error = await idp.confirmSignUp('student@vut.cz', '123456').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CognitoError)
    expect((error as CognitoError).type).toBe(type)
    expect((error as CognitoError).message).toMatch(pattern)
  })
})

describe('DemoAuthService', () => {
  it('signs in, switches and signs out demo identities', async () => {
    const service = new DemoAuthService(window.sessionStorage)
    await service.init()
    expect(service.getSnapshot().status).toBe('signedOut')
    expect(await service.getAuthorizationHeader()).toBeNull()

    service.signInAs('alice')
    expect(service.getSnapshot()).toMatchObject({ status: 'signedIn', user: { id: 'demo-user-alice' }, expiresAt: null })
    expect(await service.getAuthorizationHeader()).toBe('Demo alice')
    expect(service.describeAuthorization()).toBe('Demo alice')

    // The choice survives a reload within the tab.
    const reloaded = new DemoAuthService(window.sessionStorage)
    await reloaded.init()
    expect(reloaded.getSnapshot().user?.id).toBe('demo-user-alice')

    service.signInAs('bob')
    expect(await service.getAuthorizationHeader()).toBe('Demo bob')
    await service.signOut()
    expect(service.getSnapshot().status).toBe('signedOut')
    expect(await service.refreshAfterUnauthorized()).toBe(false)
  })

  it('ignores unknown stored identities', async () => {
    window.sessionStorage.setItem('sn.demo.identity', 'mallory')
    const service = new DemoAuthService(window.sessionStorage)
    await service.init()
    expect(service.getSnapshot().status).toBe('signedOut')
  })
})
