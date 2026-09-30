import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { getRoleHome } from '../routes/roleHome'

export function GoogleAuthCallbackPage() {
  const { loginWithToken } = useAuth()
  const navigate = useNavigate()
  const callbackStarted = useRef(false)

  useEffect(() => {
    if (callbackStarted.current) return
    callbackStarted.current = true

    const accessToken = new URLSearchParams(window.location.hash.slice(1)).get('accessToken')
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

    if (!accessToken) {
      navigate('/login?authError=GOOGLE_AUTH_FAILED', { replace: true })
      return
    }

    void loginWithToken(accessToken)
      .then((user) => navigate(getRoleHome(user.role.name), { replace: true }))
      .catch(() => navigate('/login?authError=GOOGLE_AUTH_FAILED', { replace: true }))
  }, [loginWithToken, navigate])

  return <main role="status">Finalizando el inicio de sesión...</main>
}
