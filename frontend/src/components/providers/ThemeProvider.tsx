import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ThemeContext, THEME_STORAGE_KEY, type ThemePreference } from '../../hooks/useTheme'

const QUERY = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

function subscribeSystem(listener: () => void): () => void {
  const media = window.matchMedia?.(QUERY)
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}

const systemPrefersDark = () => window.matchMedia?.(QUERY).matches ?? false

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const systemDark = useSyncExternalStore(subscribeSystem, systemPrefersDark)
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* the choice then lasts until reload */
    }
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }) as const, [preference, resolved, setPreference])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
