import type { AppMode } from '../../types/config'
import type { ApiAuth } from '../apiClient'

export interface AuthUser {
  /** Stable user id (Cognito `sub`, or the demo user's id). Display only on the client. */
  id: string
  email: string
  displayName: string
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export type AuthNotice = 'session-expired' | 'signed-out' | null

export interface AuthSnapshot {
  status: AuthStatus
  user: AuthUser | null
  /** Why the user is on the sign-in page, if there is something to tell them. */
  notice: AuthNotice
  /** Access-token expiry (epoch ms); null in demo mode. Never the token itself. */
  expiresAt: number | null
}

/** Mode-independent contract. Pages use this through `useAuth()` and never ask for the mode
 *  unless they render something mode-specific (the sign-in page, the identity switcher). */
export interface AuthService extends ApiAuth {
  readonly mode: AppMode
  getSnapshot(): AuthSnapshot
  subscribe(listener: () => void): () => void
  /** Restores an existing session if possible. Idempotent. */
  init(): Promise<void>
  /** Authorization header with the credential redacted, safe to render. */
  describeAuthorization(): string | null
  clearNotice(): void
  signOut(): Promise<void>
}

export class AuthStore {
  private snapshot: AuthSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(initial: AuthSnapshot) {
    this.snapshot = initial
  }

  get = (): AuthSnapshot => this.snapshot

  set(patch: Partial<AuthSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const SIGNED_OUT: AuthSnapshot = { status: 'signedOut', user: null, notice: null, expiresAt: null }
