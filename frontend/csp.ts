/**
 * Content-Security-Policy generated at build/dev-server start from the configured
 * endpoints, so `connect-src` lists exactly the API and Cognito origins in use.
 *
 * Delivered as a <meta> tag because the SPA is hosted as static files. Directives that
 * only work as HTTP headers (frame-ancestors, report-uri) must be added by the host
 * (e.g. a CloudFront response-headers policy).
 */
export interface CspEnv {
  VITE_API_BASE_URL?: string
  VITE_COGNITO_DOMAIN?: string
  VITE_AWS_REGION?: string
  VITE_APP_MODE?: string
}

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

export function connectSources(env: CspEnv): string[] {
  const sources = new Set<string>(["'self'"])
  const api = originOf(env.VITE_API_BASE_URL)
  if (api) sources.add(api)
  if (env.VITE_APP_MODE === 'aws') {
    const domain = originOf(env.VITE_COGNITO_DOMAIN)
    if (domain) sources.add(domain)
    if (env.VITE_AWS_REGION && /^[a-z0-9-]+$/.test(env.VITE_AWS_REGION)) {
      sources.add(`https://cognito-idp.${env.VITE_AWS_REGION}.amazonaws.com`)
    }
  }
  return [...sources]
}

export function buildCsp(env: CspEnv, options: { dev: boolean }): string {
  const connect = connectSources(env)
  // The Vite dev server needs inline scripts/styles (React Fast Refresh preamble, injected
  // <style> tags) and a websocket for HMR. Production builds get the strict policy.
  if (options.dev) connect.push('ws://localhost:*', 'ws://127.0.0.1:*')
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': options.dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': connect,
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}
