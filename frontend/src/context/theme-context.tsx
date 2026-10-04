import { createContext } from 'react'

import type { ThemeState } from '../types/theme'

export const ThemeContext = createContext<ThemeState | null>(null)
