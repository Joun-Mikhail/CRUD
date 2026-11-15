/** PKCE (RFC 7636) helpers built on the Web Crypto API. */

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Cryptographically random URL-safe string (`byteLength` bytes of entropy). */
export function randomUrlSafeString(byteLength = 32, cryptoImpl: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(byteLength)
  cryptoImpl.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/** 43-character code verifier (32 random bytes), within the 43..128 range of RFC 7636. */
export function createCodeVerifier(cryptoImpl: Crypto = globalThis.crypto): string {
  return randomUrlSafeString(32, cryptoImpl)
}

/** S256 code challenge: BASE64URL(SHA-256(ASCII(verifier))). */
export async function createCodeChallenge(
  verifier: string,
  cryptoImpl: Crypto = globalThis.crypto,
): Promise<string> {
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}
