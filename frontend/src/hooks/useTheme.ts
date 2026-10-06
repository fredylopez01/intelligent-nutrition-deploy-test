import { useContext } from 'react'

import { ThemeContext } from '../context/theme-context'
import type { ThemeState } from '../types/theme'

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  }
  return ctx
}
