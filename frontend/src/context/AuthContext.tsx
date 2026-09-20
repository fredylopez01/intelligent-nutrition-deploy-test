import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { authService } from '../services/auth.service'
import { setUnauthorizedHandler } from '../services/http'
import type { AuthState, LoginCredentials, SessionUser } from '../types/auth'

import { AuthContext } from './auth-context'

const STORAGE_KEY = 'intelligent-nutrition:session'

// Usuario simulado para desarrollar sin depender del backend de login.
// Se activa solo con VITE_MOCK_SESSION=true (ver .env.example).
// NUNCA debe estar activo en un build de producción.
const MOCK_USER: SessionUser = {
  id: 'mock-superadmin',
  fullName: 'Natalia Bernal',
  email: 'natalia.bernal@intelligent.co',
  roleId: 'mock-role-superadmin',
  active: true,
  role: { name: 'SUPER ADMIN' },
}

interface StoredSession {
  token: string
  user: SessionUser
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isMockSession = import.meta.env.VITE_MOCK_SESSION === 'true'

  // Leer localStorage es síncrono, así que el estado inicial se calcula
  // directo aquí (con el inicializador perezoso de useState) en vez de
  // en un useEffect, evitando cascading renders.
  const [user, setUser] = useState<SessionUser | null>(() => readStoredSession()?.user ?? null)
  const [token, setToken] = useState<string | null>(() => readStoredSession()?.token ?? null)
  const [status, setStatus] = useState<AuthState['status']>(() =>
    readStoredSession() ? 'authenticated' : 'idle',
  )
  const [error, setError] = useState<string | null>(null)

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setStatus('idle')
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  // setUnauthorizedHandler solo registra una referencia mutable (no llama
  // setState), así que es una suscripción legítima a un sistema externo
  // dentro de un efecto: no dispara cascading renders.
  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  const login = useCallback(
    async (credentials: LoginCredentials): Promise<SessionUser> => {
      setStatus('loading')
      setError(null)

      if (isMockSession) {
        // Simula latencia de red para poder ver el estado "Ingresando...".
        // Acepta cualquier correo/contraseña, ya que aquí no hay backend.
        await new Promise((resolve) => setTimeout(resolve, 600))
        setUser(MOCK_USER)
        setToken('dev-mock-token')
        setStatus('authenticated')
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ token: 'dev-mock-token', user: MOCK_USER }),
        )
        return MOCK_USER
      }

      try {
        const { accessToken } = await authService.login(credentials)
        const loggedUser = await authService.me(accessToken)

        setUser(loggedUser)
        setToken(accessToken)
        setStatus('authenticated')
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: accessToken, user: loggedUser }))
        return loggedUser
      } catch (err) {
        setStatus('error')
        setError(
          err instanceof Error ? err.message : 'No fue posible iniciar sesión. Intenta de nuevo.',
        )
        throw err
      }
    },
    [isMockSession],
  )

  const value = useMemo<AuthState>(
    () => ({ user, token, status, error, login, logout }),
    [user, token, status, error, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
