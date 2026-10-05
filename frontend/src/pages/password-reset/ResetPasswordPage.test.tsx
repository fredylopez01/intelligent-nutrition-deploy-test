import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'

import { ResetPasswordPage } from './ResetPasswordPage'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: 'token=abc123',
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useSearchParams: () => [new URLSearchParams(mocks.search)],
}))

vi.mock('../../services/auth.service', () => ({
  authService: {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

vi.mock('../../layouts/AuthLayout', () => ({
  AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const resetPassword = vi.mocked(authService.resetPassword)

const VALID_PASSWORD = 'Abc123!x'

function renderReset(search = 'token=abc123') {
  mocks.search = search
  return render(<ResetPasswordPage />)
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetPassword.mockReset()
    mocks.navigate.mockReset()
    mocks.search = 'token=abc123'
  })

  it('shows the invalid-link screen when the token is missing', () => {
    renderReset('')
    expect(screen.getByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'El enlace de recuperación no es válido o ya expiró. Solicita uno nuevo para continuar.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('asks for a new link when the token is missing', async () => {
    const user = userEvent.setup()
    renderReset('')
    await user.click(screen.getByRole('button', { name: 'Solicitar otro enlace' }))
    expect(mocks.navigate).toHaveBeenCalledWith('/forget-password')
  })

  it('renders the new-password form when the token is present', () => {
    renderReset()
    expect(screen.getByRole('heading', { name: 'Crea una contraseña nueva' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Usa al menos 8 caracteres, con mayúscula, minúscula, número y carácter especial.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar contraseña')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Mostrar contraseñas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar contraseña' })).toBeInTheDocument()
  })

  it.each([
    ['short password', 'Ab1!xyz', 'Debe tener al menos 8 caracteres'],
    ['too long password', `Aa1!${'a'.repeat(125)}`, 'No puede superar los 128 caracteres'],
    ['password without lowercase', 'ABC123!@#', 'Debe incluir al menos una letra minúscula'],
    ['password without uppercase', 'abc123!@#', 'Debe incluir al menos una letra mayúscula'],
    ['password without number', 'abcDEF!@#', 'Debe incluir al menos un número'],
    [
      'password without special character',
      'abcDEF123',
      'Debe incluir al menos un carácter especial',
    ],
  ])('rejects a %s and explains the policy', async (_label, value, message) => {
    const user = userEvent.setup()
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), value)
    await user.type(screen.getByLabelText('Confirmar contraseña'), value)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('requires the confirmation field', async () => {
    const user = userEvent.setup()
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Confirma tu contraseña')).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('rejects a confirmation that does not match the password', async () => {
    const user = userEvent.setup()
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Abc123!y')
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(resetPassword).not.toHaveBeenCalled()
  })

  it('sends the token and the new password to the reset endpoint', async () => {
    const user = userEvent.setup()
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(resetPassword).toHaveBeenCalledTimes(1)
    expect(resetPassword).toHaveBeenCalledWith({
      token: 'abc123',
      password: VALID_PASSWORD,
    })
  })

  it('confirms the update and offers the way back to the login page', async () => {
    const user = userEvent.setup()
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(
      await screen.findByRole('heading', { name: 'Contraseña actualizada' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ya puedes iniciar sesión con tu nueva contraseña.',
    )
    await user.click(screen.getByRole('button', { name: 'Ir a iniciar sesión' }))
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('treats an expired link (404) as an invalid link', async () => {
    const user = userEvent.setup()
    resetPassword.mockRejectedValue(new ApiError('Not found', 404))
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(resetPassword).toHaveBeenCalled()
  })

  it('shows the API error message when the server rejects the request', async () => {
    const user = userEvent.setup()
    resetPassword.mockRejectedValue(new ApiError('Servidor no disponible', 500))
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor no disponible')
  })

  it('shows the connection error message when the request fails', async () => {
    const user = userEvent.setup()
    resetPassword.mockRejectedValue(new Error('network down'))
    renderReset()
    await user.type(screen.getByLabelText('Contraseña nueva'), VALID_PASSWORD)
    await user.type(screen.getByLabelText('Confirmar contraseña'), VALID_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor. Intenta de nuevo.',
    )
  })

  it('reveals both password fields when the visibility checkbox is checked', async () => {
    const user = userEvent.setup()
    renderReset()
    const passwordInput = screen.getByLabelText('Contraseña nueva')
    expect(passwordInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('checkbox', { name: 'Mostrar contraseñas' }))
    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText('Confirmar contraseña')).toHaveAttribute('type', 'text')
  })
})
