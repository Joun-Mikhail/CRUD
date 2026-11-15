import type { AppConfig, ConfigResult } from './types/config'

export type EnvSource = Readonly<Record<string, string | boolean | undefined>>

export const DEFAULT_SCOPES = 'openid email notes/read notes/write'

function read(env: EnvSource, key: string): string {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

/** Returns a problem description, or null when `value` is an acceptable http(s) URL. */
function urlProblem(name: string, value: string, options: { requireHttps: boolean }): string | null {
  if (!value) return `${name} is missing.`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `${name} is not a valid URL ("${value}").`
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return `${name} must be an http(s) URL.`
  }
  if (options.requireHttps && url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
    return `${name} must use https (http is only accepted for localhost).`
  }
  return null
}

/**
 * Validates the Vite environment. There is deliberately no fallback between modes:
 * an incomplete configuration is reported, never guessed.
 */
export function loadConfig(env: EnvSource, origin: string): ConfigResult {
  const mode = read(env, 'VITE_APP_MODE')
  const problems: string[] = []

  if (mode !== 'demo' && mode !== 'aws') {
    problems.push(
      mode
        ? `VITE_APP_MODE must be "demo" or "aws" (got "${mode}").`
        : 'VITE_APP_MODE is missing (expected "demo" or "aws").',
    )
    return { ok: false, mode: mode || null, problems }
  }

  const apiBaseUrl = stripTrailingSlash(read(env, 'VITE_API_BASE_URL'))
  const apiProblem = urlProblem('VITE_API_BASE_URL', apiBaseUrl, { requireHttps: mode === 'aws' })
  if (apiProblem) problems.push(apiProblem)

  if (mode === 'demo') {
    return problems.length ? { ok: false, mode, problems } : { ok: true, config: { mode, apiBaseUrl } }
  }

  const region = read(env, 'VITE_AWS_REGION')
  const userPoolId = read(env, 'VITE_COGNITO_USER_POOL_ID')
  const clientId = read(env, 'VITE_COGNITO_CLIENT_ID')
  const domain = stripTrailingSlash(read(env, 'VITE_COGNITO_DOMAIN'))
  const redirectUri = read(env, 'VITE_OAUTH_REDIRECT_URI') || `${origin}/auth/callback`
  const logoutUri = read(env, 'VITE_OAUTH_LOGOUT_URI') || `${origin}/`
  const scopes = (read(env, 'VITE_OAUTH_SCOPES') || DEFAULT_SCOPES).split(/\s+/).filter(Boolean)

  if (!region) problems.push('VITE_AWS_REGION is missing.')
  else if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(region)) {
    problems.push(`VITE_AWS_REGION does not look like an AWS region ("${region}").`)
  }
  if (!userPoolId) problems.push('VITE_COGNITO_USER_POOL_ID is missing.')
  else if (!/^[a-z0-9-]+_[A-Za-z0-9]+$/.test(userPoolId)) {
    problems.push('VITE_COGNITO_USER_POOL_ID must look like "<region>_<id>".')
  }
  if (!clientId) problems.push('VITE_COGNITO_CLIENT_ID is missing.')
  for (const [name, value] of [
    ['VITE_COGNITO_DOMAIN', domain],
    ['VITE_OAUTH_REDIRECT_URI', redirectUri],
    ['VITE_OAUTH_LOGOUT_URI', logoutUri],
  ] as const) {
    const problem = urlProblem(name, value, { requireHttps: true })
    if (problem) problems.push(problem)
  }
  if (!scopes.includes('openid')) problems.push('VITE_OAUTH_SCOPES must include "openid".')

  if (problems.length) return { ok: false, mode, problems }
  const config: AppConfig = {
    mode,
    apiBaseUrl,
    cognito: { region, userPoolId, clientId, domain, redirectUri, logoutUri, scopes },
  }
  return { ok: true, config }
}
