/**
 * Decodes a JWT payload WITHOUT verifying it. Only used to display the user's e-mail
 * and the token expiry. Never use the result for a security decision: the API
 * (API Gateway's Cognito authorizer) is the only place tokens are verified.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function stringClaim(claims: Record<string, unknown> | null, name: string): string | null {
  const value = claims?.[name]
  return typeof value === 'string' && value ? value : null
}
