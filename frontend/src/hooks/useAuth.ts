import { createContext, useContext, useSyncExternalStore } from 'react'
import type { AuthService, AuthSnapshot } from '../services/auth/types'

export const AuthContext = createContext<AuthService | null>(null)

export interface AuthState extends AuthSnapshot {
  service: AuthService
}

/** Mode-independent authentication state. `service` narrows on `service.mode` when a page
 *  needs something mode-specific. */
export function useAuth(): AuthState {
  const service = useContext(AuthContext)
  if (!service) throw new Error('useAuth must be used inside <AppProviders>')
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot)
  return { ...snapshot, service }
}
