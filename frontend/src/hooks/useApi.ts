import { createContext, useContext } from 'react'
import type { ApiClient } from '../services/apiClient'
import type { NotesApi } from '../services/notesApi'

export interface ApiServices {
  client: ApiClient
  notes: NotesApi
}

export const ApiContext = createContext<ApiServices | null>(null)

export function useApi(): ApiServices {
  const api = useContext(ApiContext)
  if (!api) throw new Error('useApi must be used inside <AppProviders>')
  return api
}
