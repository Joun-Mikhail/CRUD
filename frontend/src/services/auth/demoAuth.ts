import { AuthStore, SIGNED_OUT, type AuthService, type AuthSnapshot, type AuthUser } from './types'

/** The identities known to backend/local_demo/server.py. They are not accounts: there is
 *  no password and no token. The backend simply trusts `Authorization: Demo <name>`. */
export const DEMO_IDENTITIES = [
  { name: 'alice', id: 'demo-user-alice', email: 'alice@demo.local', displayName: 'Alice' },
  { name: 'bob', id: 'demo-user-bob', email: 'bob@demo.local', displayName: 'Bob' },
  { name: 'carol', id: 'demo-user-carol', email: 'carol@demo.local', displayName: 'Carol' },
] as const

export type DemoIdentityName = (typeof DEMO_IDENTITIES)[number]['name']

const STORAGE_KEY = 'sn.demo.identity'

function findIdentity(name: string | null) {
  return DEMO_IDENTITIES.find((identity) => identity.name === name) ?? null
}

export class DemoAuthService implements AuthService {
  readonly mode = 'demo' as const
  private readonly store: AuthStore
  private identity: DemoIdentityName | null

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
    // The chosen identity is not a credential, so remembering it for the tab is harmless.
    const remembered = findIdentity(this.readStorage())
    this.identity = remembered?.name ?? null
    this.store = new AuthStore(remembered ? this.signedIn(remembered) : SIGNED_OUT)
  }

  getSnapshot = (): AuthSnapshot => this.store.get()
  subscribe = (listener: () => void) => this.store.subscribe(listener)

  init(): Promise<void> {
    return Promise.resolve()
  }

  get currentIdentity(): DemoIdentityName | null {
    return this.identity
  }

  signInAs(name: DemoIdentityName): void {
    const identity = findIdentity(name)
    if (!identity) throw new Error(`Unknown demo identity: ${String(name)}`)
    this.identity = identity.name
    try {
      this.storage.setItem(STORAGE_KEY, identity.name)
    } catch {
      /* storage unavailable: the identity lasts until reload */
    }
    this.store.set(this.signedIn(identity))
  }

  async signOut(): Promise<void> {
    this.clear('signed-out')
  }

  getAuthorizationHeader(): Promise<string | null> {
    return Promise.resolve(this.identity ? `Demo ${this.identity}` : null)
  }

  describeAuthorization(): string | null {
    // Nothing to redact: the demo header contains a name, not a secret.
    return this.identity ? `Demo ${this.identity}` : null
  }

  refreshAfterUnauthorized(): Promise<boolean> {
    return Promise.resolve(false)
  }

  expireSession(): void {
    this.clear('session-expired')
  }

  clearNotice(): void {
    if (this.store.get().notice) this.store.set({ notice: null })
  }

  private clear(notice: AuthSnapshot['notice']): void {
    this.identity = null
    try {
      this.storage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    this.store.set({ ...SIGNED_OUT, notice })
  }

  private readStorage(): string | null {
    try {
      return this.storage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  }

  private signedIn(identity: (typeof DEMO_IDENTITIES)[number]): AuthSnapshot {
    const user: AuthUser = { id: identity.id, email: identity.email, displayName: identity.displayName }
    return { status: 'signedIn', user, notice: null, expiresAt: null }
  }
}
