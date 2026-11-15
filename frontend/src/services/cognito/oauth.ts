/**
 * OAuth 2.0 endpoints of the Cognito hosted login (authorization code grant with PKCE).
 * https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-userpools-server-contract-reference.html
 */
import type { CognitoConfig } from '../../types/config'

export class OAuthError extends Error {
  /** OAuth error code (`invalid_grant`, `access_denied`, ...) or `network_error`. */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'OAuthError'
    this.code = code
  }
}

export interface TokenResponse {
  accessToken: string
  /** Absent only if the `openid` scope was not granted. */
  idToken: string | null
  /** Returned by the code exchange; on refresh only when refresh-token rotation is enabled. */
  refreshToken: string | null
  /** Access-token lifetime in seconds. */
  expiresIn: number
}

type OAuthConfig = Pick<CognitoConfig, 'domain' | 'clientId' | 'redirectUri' | 'logoutUri' | 'scopes'>

export function buildAuthorizeUrl(
  config: OAuthConfig,
  params: { state: string; codeChallenge: string; loginHint?: string },
): string {
  const url = new URL(`${config.domain}/oauth2/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    ...(params.loginHint ? { login_hint: params.loginHint } : {}),
  }).toString()
  return url.toString()
}

export function buildLogoutUrl(config: OAuthConfig): string {
  const url = new URL(`${config.domain}/logout`)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  }).toString()
  return url.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function postForm(
  url: string,
  form: Record<string, string>,
  fetchImpl: typeof fetch | undefined,
  signal?: AbortSignal,
): Promise<{ response: Response; body: unknown }> {
  try {
    const response = await (fetchImpl ?? globalThis.fetch)(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      credentials: 'omit',
      cache: 'no-store',
      signal,
    })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? (JSON.parse(text) as unknown) : null
    } catch {
      body = null
    }
    return { response, body }
  } catch {
    throw new OAuthError('network_error', 'The sign-in service could not be reached.')
  }
}

async function tokenRequest(
  config: OAuthConfig,
  form: Record<string, string>,
  fetchImpl?: typeof fetch,
): Promise<TokenResponse> {
  const { response, body } = await postForm(`${config.domain}/oauth2/token`, form, fetchImpl)
  if (!response.ok) {
    const code = isRecord(body) && typeof body.error === 'string' ? body.error : 'token_request_failed'
    throw new OAuthError(code, `The token request was rejected (${code}).`)
  }
  if (
    !isRecord(body) ||
    typeof body.access_token !== 'string' ||
    !body.access_token ||
    typeof body.expires_in !== 'number'
  ) {
    throw new OAuthError('invalid_token_response', 'The sign-in service returned an unexpected response.')
  }
  return {
    accessToken: body.access_token,
    idToken: typeof body.id_token === 'string' ? body.id_token : null,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresIn: body.expires_in,
  }
}

export function exchangeAuthorizationCode(
  config: OAuthConfig,
  params: { code: string; codeVerifier: string },
  fetchImpl?: typeof fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    config,
    {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: params.code,
      redirect_uri: config.redirectUri,
      code_verifier: params.codeVerifier,
    },
    fetchImpl,
  )
}

export function refreshAccessToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl?: typeof fetch,
): Promise<TokenResponse> {
  return tokenRequest(
    config,
    { grant_type: 'refresh_token', client_id: config.clientId, refresh_token: refreshToken },
    fetchImpl,
  )
}

/** Best effort: revokes the refresh token (and the access tokens issued from it). */
export async function revokeRefreshToken(
  config: OAuthConfig,
  refreshToken: string,
  fetchImpl?: typeof fetch,
  signal?: AbortSignal,
): Promise<void> {
  const { response } = await postForm(
    `${config.domain}/oauth2/revoke`,
    { token: refreshToken, client_id: config.clientId },
    fetchImpl,
    signal,
  )
  if (!response.ok) throw new OAuthError('revoke_failed', 'The refresh token could not be revoked.')
}
