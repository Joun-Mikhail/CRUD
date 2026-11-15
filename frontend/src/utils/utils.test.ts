import { describe, expect, it } from 'vitest'
import { filterAndSort, loadedCountLabel, recentlyUpdated } from '../components/notes/noteHelpers'
import { loadConfig } from '../config'
import { makeNote } from '../test/helpers'
import { decodeJwtPayload, stringClaim } from './jwt'
import { charCount, serverIssuesToErrors, validateNote } from './noteValidation'
import { isPlausibleEmail, passwordMeetsPolicy } from './passwordPolicy'
import { base64UrlEncode, createCodeChallenge, createCodeVerifier } from './pkce'

describe('pkce', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    const challenge = await createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('creates url-safe, unpredictable verifiers of legal length', () => {
    const first = createCodeVerifier()
    expect(first).toMatch(/^[A-Za-z0-9\-_]{43,128}$/)
    expect(createCodeVerifier()).not.toBe(first)
    expect(base64UrlEncode(new Uint8Array([251, 255, 254]))).toBe('-__-')
  })
})

describe('jwt display helpers', () => {
  it('decodes a payload for display and tolerates garbage', () => {
    const payload = btoa(JSON.stringify({ sub: 'abc', email: 'a@b.cz', exp: 1 })).replace(/=+$/, '')
    const claims = decodeJwtPayload(`x.${payload}.sig`)
    expect(stringClaim(claims, 'email')).toBe('a@b.cz')
    expect(stringClaim(claims, 'exp')).toBeNull()
    expect(decodeJwtPayload('not-a-jwt')).toBeNull()
    expect(decodeJwtPayload('a.%%%.c')).toBeNull()
  })
})

describe('config', () => {
  const origin = 'http://localhost:5173'
  const aws = {
    VITE_APP_MODE: 'aws',
    VITE_API_BASE_URL: 'https://abc.execute-api.eu-central-1.amazonaws.com/dev/',
    VITE_AWS_REGION: 'eu-central-1',
    VITE_COGNITO_USER_POOL_ID: 'eu-central-1_AbCdEf123',
    VITE_COGNITO_CLIENT_ID: 'client123',
    VITE_COGNITO_DOMAIN: 'https://notes.auth.eu-central-1.amazoncognito.com',
  }

  it('accepts demo mode', () => {
    const result = loadConfig({ VITE_APP_MODE: 'demo', VITE_API_BASE_URL: 'http://127.0.0.1:8787' }, origin)
    expect(result).toEqual({ ok: true, config: { mode: 'demo', apiBaseUrl: 'http://127.0.0.1:8787' } })
  })

  it('accepts a complete aws configuration and applies defaults', () => {
    const result = loadConfig(aws, origin)
    if (!result.ok || result.config.mode !== 'aws') throw new Error('expected aws config')
    expect(result.config.apiBaseUrl).toBe('https://abc.execute-api.eu-central-1.amazonaws.com/dev')
    expect(result.config.cognito.redirectUri).toBe('http://localhost:5173/auth/callback')
    expect(result.config.cognito.scopes).toEqual(['openid', 'email', 'notes/read', 'notes/write'])
  })

  it('reports every problem instead of falling back to another mode', () => {
    expect(loadConfig({}, origin)).toMatchObject({ ok: false, mode: null })
    expect(loadConfig({ VITE_APP_MODE: 'mock', VITE_API_BASE_URL: 'x' }, origin).ok).toBe(false)
    const incomplete = loadConfig({ VITE_APP_MODE: 'aws', VITE_API_BASE_URL: 'http://insecure.example' }, origin)
    if (incomplete.ok) throw new Error('expected failure')
    expect(incomplete.mode).toBe('aws')
    expect(incomplete.problems.join(' ')).toMatch(/VITE_COGNITO_CLIENT_ID/)
    expect(incomplete.problems.join(' ')).toMatch(/https/i)
  })
})

describe('note validation mirrors the server', () => {
  it('accepts valid input and trims the title for counting', () => {
    expect(validateNote('  ok  ', '')).toEqual({})
    expect(validateNote('t'.repeat(200), 'c'.repeat(20_000))).toEqual({})
  })

  it('rejects empty, long and control-character titles and long content', () => {
    expect(validateNote('   ', 'x').title).toBe('Enter a title.')
    expect(validateNote('t'.repeat(201), 'x').title).toMatch(/at most 200/)
    expect(validateNote('a\nb', 'x').title).toMatch(/control characters/)
    expect(validateNote('ok', 'c'.repeat(20_001)).content).toMatch(/at most 20,000/)
  })

  it('counts code points like Python does', () => {
    expect(charCount('📝📝')).toBe(2)
    expect(validateNote('📝'.repeat(200), '').title).toBeUndefined()
  })

  it('maps server issues onto fields', () => {
    const mapped = serverIssuesToErrors([
      { field: 'title', issue: 'must not be empty' },
      { field: 'extra', issue: 'unknown field' },
    ])
    expect(mapped.fields.title).toBe('The title must not be empty.')
    expect(mapped.other).toEqual(['extra: unknown field'])
  })
})

describe('password policy and e-mail', () => {
  it('mirrors the Cognito policy', () => {
    expect(passwordMeetsPolicy('Correct-Horse-9')).toBe(true)
    for (const weak of ['Short-1a', 'nouppercase-123', 'NOLOWERCASE-123', 'NoNumber-here!', 'NoSymbol12345'])
      expect(passwordMeetsPolicy(weak)).toBe(false)
    expect(isPlausibleEmail(' a@b.cz ')).toBe(true)
    expect(isPlausibleEmail('nope')).toBe(false)
  })
})

describe('note list helpers', () => {
  const notes = [
    makeNote({ noteId: 'a', title: 'beta', content: 'x', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-05T00:00:00Z' }),
    makeNote({ noteId: 'b', title: 'Alpha', content: 'needle', createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' }),
    makeNote({ noteId: 'c', title: 'gamma', content: 'y', createdAt: '2026-01-03T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' }),
  ]

  it('filters by title or content, case-insensitively', () => {
    expect(filterAndSort(notes, 'NEEDLE', 'created-desc').map((n) => n.noteId)).toEqual(['b'])
    expect(filterAndSort(notes, 'GAM', 'created-desc').map((n) => n.noteId)).toEqual(['c'])
  })

  it('sorts without mutating the input', () => {
    expect(filterAndSort(notes, '', 'created-desc').map((n) => n.noteId)).toEqual(['c', 'b', 'a'])
    expect(filterAndSort(notes, '', 'updated-desc').map((n) => n.noteId)).toEqual(['a', 'c', 'b'])
    expect(filterAndSort(notes, '', 'title-asc').map((n) => n.noteId)).toEqual(['b', 'a', 'c'])
    expect(notes.map((n) => n.noteId)).toEqual(['a', 'b', 'c'])
    expect(recentlyUpdated(notes, 2).map((n) => n.noteId)).toEqual(['a', 'c'])
  })

  it('never overstates how many notes exist', () => {
    expect(loadedCountLabel(20, true)).toBe('20+')
    expect(loadedCountLabel(3, false)).toBe('3')
  })
})
