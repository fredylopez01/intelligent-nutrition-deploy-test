import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GoogleAuthCallbackPage } from './GoogleAuthCallbackPage'

const navigate = vi.fn()
const authMocks = vi.hoisted(() => ({
  loginWithToken: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ loginWithToken: authMocks.loginWithToken }),
}))

function setHash(hash: string) {
  window.history.replaceState(null, '', hash ? `/${hash}` : '/')
}

describe('GoogleAuthCallbackPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setHash('')
  })

  it('shows the finishing status while the session is being resolved', () => {
    authMocks.loginWithToken.mockReturnValue(new Promise(() => {}))
    setHash('#accessToken=jwt-123')

    render(<GoogleAuthCallbackPage />)

    expect(screen.getByRole('status')).toHaveTextContent('Finalizando el inicio de sesión...')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('consumes the access token and navigates to the role home', async () => {
    authMocks.loginWithToken.mockResolvedValue({
      role: { name: 'BRANCH_ASSISTANT' },
    })
    setHash('#accessToken=jwt-123')

    render(<GoogleAuthCallbackPage />)

    await waitFor(() => expect(authMocks.loginWithToken).toHaveBeenCalledWith('jwt-123'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pos', { replace: true }))
  })

  it('removes the access token from the address bar after reading it', async () => {
    authMocks.loginWithToken.mockResolvedValue({
      role: { name: 'SUPERADMIN' },
    })
    setHash('#accessToken=jwt-123')

    render(<GoogleAuthCallbackPage />)

    await waitFor(() => expect(authMocks.loginWithToken).toHaveBeenCalledWith('jwt-123'))
    await waitFor(() => expect(window.location.hash).toBe(''))
  })

  it('redirects to the login page when there is no access token', () => {
    render(<GoogleAuthCallbackPage />)

    expect(authMocks.loginWithToken).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/login?authError=GOOGLE_AUTH_FAILED', {
      replace: true,
    })
  })

  it('redirects to the login page when the session cannot be resolved', async () => {
    authMocks.loginWithToken.mockRejectedValue(new Error('invalid token'))
    setHash('#accessToken=expired-token')

    render(<GoogleAuthCallbackPage />)

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/login?authError=GOOGLE_AUTH_FAILED', {
        replace: true,
      }),
    )
  })
})
