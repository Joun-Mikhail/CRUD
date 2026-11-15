import { createContext, useContext } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeState {
  preference: ThemePreference
  /** The theme actually applied after resolving `system`. */
  resolved: 'light' | 'dark'
  setPreference(preference: ThemePreference): void
}

export const ThemeContext = createContext<ThemeState | null>(null)
export const THEME_STORAGE_KEY = 'sn.theme'

export function useTheme(): ThemeState {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>')
  return theme
}
