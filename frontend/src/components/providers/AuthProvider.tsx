import { useEffect, type ReactNode } from 'react'
import { AuthContext } from '../../hooks/useAuth'
import type { AuthService } from '../../services/auth/types'

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  useEffect(() => {
    void service.init()
  }, [service])
  return <AuthContext.Provider value={service}>{children}</AuthContext.Provider>
}
