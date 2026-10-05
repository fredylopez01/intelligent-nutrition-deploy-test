import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'

import { ForgotPasswordPage } from './ForgotPasswordPage'

vi.mock('../../services/auth.service', () => ({
  authService: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

vi.mock('../../layouts/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const forgotPassword = vi.mocked(authService.forgotPassword)

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    forgotPassword.mockReset()
  })

  it('renders the recovery form with its heading and email field', () => {
    render(<ForgotPasswordPage />)
    expect(screen.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
    expect(screen.getByText('Recuperación de cuenta')).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeInTheDocument()
  })

  it('requires the email before sending', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByText('Ingresa tu correo')).toBeInTheDocument()
    expect(forgotPassword).not.toHaveBeenCalled()
  })

  it('rejects a malformed email address', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-un-correo')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(forgotPassword).not.toHaveBeenCalled()
  })

  it('sends the email to the forgot-password endpoint', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'user@test.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(forgotPassword).toHaveBeenCalledTimes(1)
    expect(forgotPassword).toHaveBeenCalledWith({ email: 'user@test.com' })
  })

  it('shows the neutral success message and hides the form', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'user@test.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      /Si existe una cuenta con ese correo/i,
    )
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Intentar con otro correo' })).toBeInTheDocument()
  })

  it('returns to the form when the user wants to try another email', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'user@test.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    await user.click(await screen.findByRole('button', { name: 'Intentar con otro correo' }))
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
  })

  it('shows the connection error message when the request fails', async () => {
    const user = userEvent.setup()
    vi.mocked(forgotPassword).mockRejectedValue(new Error('network down'))
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'user@test.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor. Intenta de nuevo.',
    )
  })

  it('shows the API error message when the server rejects the request', async () => {
    const user = userEvent.setup()
    vi.mocked(forgotPassword).mockRejectedValue(
      new ApiError('No pudimos procesar la solicitud.', 500),
    )
    render(<ForgotPasswordPage />)
    await user.type(screen.getByLabelText('Correo electrónico'), 'user@test.com')
    await user.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos procesar la solicitud.')
  })
})
