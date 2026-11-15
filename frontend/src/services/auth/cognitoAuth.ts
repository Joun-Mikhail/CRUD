import type { CognitoConfig } from '../../types/config'
import { decodeJwtPayload, stringClaim } from '../../utils/jwt'
import { createCodeChallenge, createCodeVerifier, randomUrlSafeString } from '../../utils/pkce'
import { createCognitoIdp, type CognitoIdp } from '../cognito/idp'
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  exchangeAuthorizationCode,
  OAuthError,
  refreshAccessToken,
  revokeRefreshToken,
  type TokenResponse,
} from '../cognito/oauth'
import { AuthStore, SIGNED_OUT, type AuthNotice, type AuthService, type AuthSnapshot, type AuthUser } from './types'

/** PKCE verifier + state: in sessionStorage only for the duration of the redirect. */
export const PENDING_KEY = 'sn.oauth.pending'
/** Non-sensitive marker ("1"): lets a reloaded tab re-run the authorize redirect. */
export const WAS_SIGNED_IN_KEY = 'sn.auth.wasSignedIn'

const REFRESH_BEFORE_EXPIRY_MS = 60_000
const MIN_REFRESH_DELAY_MS = 5_000
const EXPIRY_SKEW_MS = 30_000
const PENDING_MAX_AGE_MS = 15 * 60_000
const REVOKE_TIMEOUT_MS = 3_000

interface PendingAuthorization {
  state: string
  codeVerifier: string
  returnTo: string
  createdAt: number
}

/** Lives in this object only - never written to localStorage/sessionStorage, never logged. */
interface Tokens {
  accessToken: string
  idToken: string | null
  refreshToken: string | null
  expiresAt: number
}

export interface CognitoAuthDeps {
  config: CognitoConfig
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  /** Full-page navigation (window.location.assign). */
  redirect: (url: string) => void
  /** Current path + query, used as the post-login return target. */
  currentPath: () => string
  fetchImpl?: typeof fetch
  cryptoImpl?: Crypto
  now?: () => number
}

/** Only same-origin paths are accepted as return targets (no open redirect). */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/auth')) return '/'
  return value
}

export class CognitoAuthService implements AuthService {
  readonly mode = 'aws' as const
  readonly idp: CognitoIdp
  private readonly store = new AuthStore({ ...SIGNED_OUT, status: 'loading' })
  private readonly now: () => number
  private tokens: Tokens | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private refreshing: Promise<boolean> | null = null
  private initializing: Promise<void> | null = null
  private completion: { key: string; promise: Promise<string> } | null = null

  constructor(private readonly deps: CognitoAuthDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.idp = createCognitoIdp({
      region: deps.config.region,
      clientId: deps.config.clientId,
      fetchImpl: deps.fetchImpl,
    })
  }

  getSnapshot = (): AuthSnapshot => this.store.get()
  subscribe = (listener: () => void) => this.store.subscribe(listener)

  init(): Promise<void> {
    this.initializing ??= this.restore()
    return this.initializing
  }

  private async restore(): Promise<void> {
    const path = this.deps.currentPath()
    if (path.startsWith('/auth/callback')) {
      // The callback route finishes the sign-in via completeSignIn().
      this.store.set({ status: 'signedOut' })
      return
    }
    if (this.readStorage(WAS_SIGNED_IN_KEY) === '1') {
      // Tokens were lost with the page reload. Cognito's own session cookie on the hosted
      // login makes this redirect round trip seamless; otherwise the user sees the login form.
      try {
        await this.startSignIn({ returnTo: path })
        return // status stays "loading" while the browser navigates away
      } catch {
        this.removeStorage(WAS_SIGNED_IN_KEY)
      }
    }
    this.store.set({ status: 'signedOut' })
  }

  /** Redirects to the Cognito hosted login (authorization code + PKCE, S256). */
  async startSignIn(options: { loginHint?: string; returnTo?: string } = {}): Promise<void> {
    const codeVerifier = createCodeVerifier(this.deps.cryptoImpl)
    const state = randomUrlSafeString(24, this.deps.cryptoImpl)
    const codeChallenge = await createCodeChallenge(codeVerifier, this.deps.cryptoImpl)
    const pending: PendingAuthorization = {
      state,
      codeVerifier,
      returnTo: safeReturnPath(options.returnTo),
      createdAt: this.now(),
    }
    this.deps.storage.setItem(PENDING_KEY, JSON.stringify(pending))
    this.deps.redirect(
      buildAuthorizeUrl(this.deps.config, { state, codeChallenge, loginHint: options.loginHint }),
    )
  }

  /**
   * Handles the redirect back from Cognito (`/auth/callback?code=...&state=...`).
   * Resolves with the path to continue at. Safe to call twice for the same URL
   * (React StrictMode runs effects twice in development).
   */
  completeSignIn(params: URLSearchParams): Promise<string> {
    const key = params.toString()
    if (this.completion?.key !== key) {
      this.completion = { key, promise: this.finishSignIn(params) }
    }
    return this.completion.promise
  }

  private async finishSignIn(params: URLSearchParams): Promise<string> {
    const pending = this.takePending()
    try {
      const error = params.get('error')
      if (error) {
        throw new OAuthError(
          error,
          error === 'access_denied'
            ? 'Sign-in was cancelled or access was denied.'
            : `The sign-in service reported an error (${error}).`,
        )
      }
      const code = params.get('code')
      const state = params.get('state')
      if (!code || !state) {
        throw new OAuthError('invalid_callback', 'The sign-in response is incomplete. Start again.')
      }
      if (!pending || this.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
        throw new OAuthError(
          'no_pending_request',
          'This sign-in attempt is no longer valid (it was not started in this tab or has expired). Start again.',
        )
      }
      if (pending.state !== state) {
        throw new OAuthError(
          'state_mismatch',
          'The sign-in response does not match the request (state mismatch). Start again.',
        )
      }
      const response = await exchangeAuthorizationCode(
        this.deps.config,
        { code, codeVerifier: pending.codeVerifier },
        this.deps.fetchImpl,
      )
      this.applyTokens(response, null)
      this.writeStorage(WAS_SIGNED_IN_KEY, '1')
      return pending.returnTo
    } catch (error) {
      // Never loop: a failed attempt must not trigger the automatic re-authorization.
      this.removeStorage(WAS_SIGNED_IN_KEY)
      throw error
    }
  }

  async getAuthorizationHeader(): Promise<string | null> {
    if (!this.tokens) return null
    if (this.tokens.expiresAt - this.now() < EXPIRY_SKEW_MS) {
      const refreshed = await this.refresh()
      if (!refreshed && this.tokens && this.tokens.expiresAt <= this.now()) {
        this.expireSession()
        return null
      }
    }
    // The API authorizes with the ACCESS token (scopes); the ID token is never sent to it.
    return this.tokens ? `Bearer ${this.tokens.accessToken}` : null
  }

  describeAuthorization(): string | null {
    // Every JWT starts with "eyJ" ({" in base64), so this prefix reveals nothing.
    return this.tokens ? `Bearer ${this.tokens.accessToken.slice(0, 3)}…(redacted)` : null
  }

  refreshAfterUnauthorized(): Promise<boolean> {
    return this.refresh()
  }

  expireSession(): void {
    this.clearSession('session-expired')
  }

  clearNotice(): void {
    if (this.store.get().notice) this.store.set({ notice: null })
  }

  async signOut(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken ?? null
    this.clearSession('signed-out')
    if (refreshToken) {
      try {
        await revokeRefreshToken(
          this.deps.config,
          refreshToken,
          this.deps.fetchImpl,
          AbortSignal.timeout(REVOKE_TIMEOUT_MS),
        )
      } catch {
        /* best effort: the hosted-UI logout below still ends the Cognito session */
      }
    }
    this.deps.redirect(buildLogoutUrl(this.deps.config))
  }

  /** Uses the in-memory refresh token. Concurrent callers share one request. */
  private refresh(): Promise<boolean> {
    const refreshToken = this.tokens?.refreshToken
    if (!refreshToken) return Promise.resolve(false)
    this.refreshing ??= (async () => {
      try {
        const response = await refreshAccessToken(this.deps.config, refreshToken, this.deps.fetchImpl)
        if (!this.tokens) return false // signed out while the request was in flight
        this.applyTokens(response, this.tokens)
        return true
      } catch {
        return false
      } finally {
        this.refreshing = null
      }
    })()
    return this.refreshing
  }

  private applyTokens(response: TokenResponse, previous: Tokens | null): void {
    this.tokens = {
      accessToken: response.accessToken,
      idToken: response.idToken ?? previous?.idToken ?? null,
      refreshToken: response.refreshToken ?? previous?.refreshToken ?? null,
      expiresAt: this.now() + response.expiresIn * 1000,
    }
    this.scheduleRefresh()
    this.store.set({
      status: 'signedIn',
      user: this.describeUser(this.tokens),
      notice: null,
      expiresAt: this.tokens.expiresAt,
    })
  }

  /** Display data only. Authorization decisions are made by the API, never from these claims. */
  private describeUser(tokens: Tokens): AuthUser {
    const idClaims = tokens.idToken ? decodeJwtPayload(tokens.idToken) : null
    const accessClaims = decodeJwtPayload(tokens.accessToken)
    const id = stringClaim(idClaims, 'sub') ?? stringClaim(accessClaims, 'sub') ?? 'unknown'
    const email = stringClaim(idClaims, 'email') ?? stringClaim(accessClaims, 'username') ?? 'Signed-in user'
    return { id, email, displayName: email }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    if (!this.tokens?.refreshToken) return
    const delay = Math.max(
      this.tokens.expiresAt - this.now() - REFRESH_BEFORE_EXPIRY_MS,
      MIN_REFRESH_DELAY_MS,
    )
    this.refreshTimer = setTimeout(() => {
      void this.refresh().then((ok) => {
        // A failed silent refresh is retried on the next API call; if the token has
        // really expired by then, getAuthorizationHeader() ends the session.
        if (!ok && this.tokens && this.tokens.expiresAt <= this.now()) this.expireSession()
      })
    }, delay)
  }

  private clearSession(notice: AuthNotice): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.tokens = null
    this.removeStorage(WAS_SIGNED_IN_KEY)
    this.removeStorage(PENDING_KEY)
    this.store.set({ ...SIGNED_OUT, notice })
  }

  /** Reads and immediately deletes the PKCE verifier/state. */
  private takePending(): PendingAuthorization | null {
    const raw = this.readStorage(PENDING_KEY)
    this.removeStorage(PENDING_KEY)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<PendingAuthorization>
      if (
        typeof parsed.state === 'string' &&
        typeof parsed.codeVerifier === 'string' &&
        typeof parsed.createdAt === 'number'
      ) {
        return {
          state: parsed.state,
          codeVerifier: parsed.codeVerifier,
          returnTo: safeReturnPath(parsed.returnTo),
          createdAt: parsed.createdAt,
        }
      }
    } catch {
      /* fall through */
    }
    return null
  }

  private readStorage(key: string): string | null {
    try {
      return this.deps.storage.getItem(key)
    } catch {
      return null
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      this.deps.storage.setItem(key, value)
    } catch {
      /* without the marker the user simply signs in again after a reload */
    }
  }

  private removeStorage(key: string): void {
    try {
      this.deps.storage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}
