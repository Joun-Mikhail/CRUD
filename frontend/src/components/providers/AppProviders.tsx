import { useMemo, type ReactNode } from 'react'
import { ApiContext, type ApiServices } from '../../hooks/useApi'
import { ConfigContext } from '../../hooks/useConfig'
import { createApiClient } from '../../services/apiClient'
import type { AuthService } from '../../services/auth/types'
import { createNotesApi, type NotesApi } from '../../services/notesApi'
import type { AppConfig } from '../../types/config'
import { AuthProvider } from './AuthProvider'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'

export interface AppProvidersProps {
  config: AppConfig
  auth: AuthService
  /** Test seam: replaces the notes API built from the HTTP client. */
  notesApi?: NotesApi
  children: ReactNode
}

/** Wires configuration, theme, toasts, authentication and the API client together. */
export function AppProviders({ config, auth, notesApi, children }: AppProvidersProps) {
  const api = useMemo<ApiServices>(() => {
    const client = createApiClient({ baseUrl: config.apiBaseUrl, auth })
    return { client, notes: notesApi ?? createNotesApi(client) }
  }, [config.apiBaseUrl, auth, notesApi])

  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider service={auth}>
            <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </ConfigContext.Provider>
  )
}
