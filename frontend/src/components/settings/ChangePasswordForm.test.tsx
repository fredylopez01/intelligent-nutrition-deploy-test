import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '../../services/auth.service'
import { ApiError } from '../../services/http'

import { ChangePasswordForm } from './ChangePasswordForm'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(),
  token: 'jwt-test-token',
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: mocks.token, logout: mocks.logout }),
}))

vi.mock('../../services/auth.service', () => ({
  authService: {
    changePassword: vi.fn(),
  },
}))

const changePassword = vi.mocked(authService.changePassword)

const CURRENT = 'Current1!'
const NEW = 'Abc123!x'

function fillValidForm() {
  return {
    current: screen.getByLabelText('Contraseña actual'),
    newPassword: screen.getByLabelText('Nueva contraseña'),
    confirm: screen.getByLabelText('Confirmar nueva contraseña'),
  }
}

async function submitValid(user: ReturnType<typeof userEvent.setup>) {
  const fields = fillValidForm()
  await user.type(fields.current, CURRENT)
  await user.type(fields.newPassword, NEW)
  await user.type(fields.confirm, NEW)
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    changePassword.mockReset()
    mocks.navigate.mockReset()
    mocks.logout.mockReset()
    mocks.token = 'jwt-test-token'
  })

  it('renders the form with its three fields and the password requirements', () => {
    render(<ChangePasswordForm />)
    expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toBeInTheDocument()
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toBeInTheDocument()
    expect(screen.getByText('Requisitos de la contraseña:')).toBeInTheDocument()
    expect(screen.getByText('Mínimo 8 caracteres y máximo 128.')).toBeInTheDocument()
    expect(screen.getByText('Al menos una letra minúscula y una mayúscula.')).toBeInTheDocument()
    expect(screen.getByText('Al menos un número y un carácter especial.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeInTheDocument()
  })

  it('requires the current password before sending', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Ingresa tu contraseña actual')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
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
    render(<ChangePasswordForm />)
    const fields = fillValidForm()
    await user.type(fields.current, CURRENT)
    await user.type(fields.newPassword, value)
    await user.type(fields.confirm, value)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('requires the confirmation field', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    const fields = fillValidForm()
    await user.type(fields.current, CURRENT)
    await user.type(fields.newPassword, NEW)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Confirma la nueva contraseña')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('rejects a confirmation that does not match the new password', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    const fields = fillValidForm()
    await user.type(fields.current, CURRENT)
    await user.type(fields.newPassword, NEW)
    await user.type(fields.confirm, 'Abc123!y')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('rejects a new password equal to the current one', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    const fields = fillValidForm()
    await user.type(fields.current, CURRENT)
    await user.type(fields.newPassword, CURRENT)
    await user.type(fields.confirm, CURRENT)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(
      await screen.findByText('La nueva contraseña debe ser diferente a la actual'),
    ).toBeInTheDocument()
    expect(changePassword).not.toHaveBeenCalled()
  })

  it('submits both passwords with the session token and shows the success feedback', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    await submitValid(user)

    expect(changePassword).toHaveBeenCalledTimes(1)
    expect(changePassword).toHaveBeenCalledWith(
      { currentPassword: CURRENT, newPassword: NEW },
      'jwt-test-token',
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Contraseña actualizada exitosamente',
    )
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toHaveValue('')
  })

  it.each([
    ['INVALID_CREDENTIALS', 'La contraseña actual es incorrecta.'],
    ['PASSWORDS_ARE_EQUAL', 'La nueva contraseña debe ser diferente a la actual.'],
    ['ACCOUNT_NOT_ACTIVATED', 'Tu cuenta aún no está activada.'],
    ['USER_NOT_FOUND', 'No encontramos tu cuenta. Vuelve a iniciar sesión.'],
  ])('shows the friendly message for the %s error code', async (code, message) => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(new ApiError('backend message', 400, undefined, code))
    render(<ChangePasswordForm />)
    await submitValid(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(mocks.logout).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('logs out and returns to the login page when the session is no longer valid', async () => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(
      new ApiError('Token expired', 401, undefined, 'SESSION_EXPIRED'),
    )
    render(<ChangePasswordForm />)
    await submitValid(user)

    await vi.waitFor(() => {
      expect(mocks.logout).toHaveBeenCalledTimes(1)
    })
    expect(mocks.navigate).toHaveBeenCalledWith('/login', { replace: true })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the generic connection error when the request fails', async () => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(new Error('network down'))
    render(<ChangePasswordForm />)
    await submitValid(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos conectar con el servidor. Intenta de nuevo.',
    )
  })

  it('shows a review hint for an unknown 400 from the API', async () => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(new ApiError('weird payload', 400, undefined, 'WEIRD_CODE'))
    render(<ChangePasswordForm />)
    await submitValid(user)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Revisa los datos ingresados e intenta de nuevo.',
    )
  })

  it('falls back to the API message for other server errors', async () => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(
      new ApiError('Servidor no disponible', 500, undefined, 'INTERNAL'),
    )
    render(<ChangePasswordForm />)
    await submitValid(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor no disponible')
  })

  it('clears the fields and the feedback with the reset button', async () => {
    const user = userEvent.setup()
    changePassword.mockRejectedValue(new Error('network down'))
    render(<ChangePasswordForm />)
    await submitValid(user)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Restablecer' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña actual')).toHaveValue('')
    expect(screen.getByLabelText('Nueva contraseña')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar nueva contraseña')).toHaveValue('')
  })

  it('toggles the visibility of the new password field', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)
    const toggles = screen.getAllByRole('button', { name: 'Mostrar contraseña' })
    const newPasswordToggle = toggles[1]
    const newPasswordInput = screen.getByLabelText('Nueva contraseña')

    expect(newPasswordInput).toHaveAttribute('type', 'password')
    await user.click(newPasswordToggle)
    expect(newPasswordInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
