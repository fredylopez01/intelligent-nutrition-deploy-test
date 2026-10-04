import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import type { ResolvedTheme, ThemePreference } from '../types/theme'

import { ThemeContext } from './theme-context'

const STORAGE_KEY = 'intelligent-nutrition:theme'
const LIGHT_QUERY = '(prefers-color-scheme: light)'

function parsePreference(value: string | null): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readPreference(): ThemePreference {
  try {
    return parsePreference(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function writePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, preference)
    }
  } catch {
    return
  }
}

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(LIGHT_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const systemTheme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme)
  const theme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    const root = document.documentElement
    if (root.dataset.theme === theme) return
    root.dataset.themeSwitching = 'true'
    root.dataset.theme = theme
    void getComputedStyle(root).color
    const timeout = window.setTimeout(() => delete root.dataset.themeSwitching, 1)
    return () => {
      window.clearTimeout(timeout)
      delete root.dataset.themeSwitching
    }
  }, [theme])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setPreferenceState(parsePreference(event.newValue))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    writePreference(next)
  }, [])

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
