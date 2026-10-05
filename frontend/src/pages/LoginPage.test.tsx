import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '../services/auth.service'

import { LoginPage } from './LoginPage'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), status: 'idle' }),
}))

vi.mock('../services/auth.service', () => ({
  authService: {
    googleLoginUrl: vi.fn(() => 'http://api.test/api/v1/auth/google'),
  },
}))

vi.mock('../layouts/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const googleLoginUrl = vi.mocked(authService.googleLoginUrl)

const assignMock = vi.fn()
let originalLocation: PropertyDescriptor | undefined

function renderLogin(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/login${search}`]}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage Google button', () => {
  beforeAll(() => {
    originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { assign: assignMock },
    })
  })

  afterAll(() => {
    if (originalLocation) {
      Object.defineProperty(window, 'location', originalLocation)
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    assignMock.mockClear()
  })

  it('renders the Google button as a plain button outside the form', () => {
    renderLogin()

    const button = screen.getByRole('button', { name: 'Continuar con Google' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeEnabled()
  })

  it('sends the user to the Google login endpoint when clicked', async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole('button', { name: 'Continuar con Google' }))

    expect(googleLoginUrl).toHaveBeenCalledTimes(1)
    expect(assignMock).toHaveBeenCalledWith('http://api.test/api/v1/auth/google')
  })

  it.each([
    [
      'GOOGLE_EMAIL_NOT_REGISTERED',
      'No hay una cuenta registrada con este correo de Google. Solicita al administrador que cree tu cuenta.',
    ],
    ['GOOGLE_ACCOUNT_INACTIVE', 'Tu cuenta está inactiva. Contacta al administrador.'],
    ['ROLE_INACTIVE', 'El rol asignado a tu cuenta está inactivo. Contacta al administrador.'],
    ['GOOGLE_AUTH_FAILED', 'No fue posible iniciar sesión con Google. Inténtalo de nuevo.'],
  ])('shows the message for the %s error from the callback', (code, message) => {
    renderLogin(`?authError=${code}`)

    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  it('does not show a Google error message when the callback did not report one', () => {
    renderLogin()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores an unknown authError code from the callback', () => {
    renderLogin('?authError=SOMETHING_ELSE')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
