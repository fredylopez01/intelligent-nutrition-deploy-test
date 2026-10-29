import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import { NEQUI } from '../../test-utils/paymentMethods'

import { EditPaymentMethodForm } from './EditPaymentMethodForm'

vi.mock('../../services/paymentMethods.service', () => ({
  paymentMethodsService: { update: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateMethod = vi.mocked(paymentMethodsService.update)

function renderForm() {
  const onUpdated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<EditPaymentMethodForm paymentMethod={NEQUI} onUpdated={onUpdated} onCancel={onCancel} />)
  return { user, onUpdated, onCancel }
}

async function rename(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(screen.getByLabelText('Nombre'))
  if (value) await user.type(screen.getByLabelText('Nombre'), value)
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  updateMethod.mockImplementation((id, payload) => Promise.resolve({ ...NEQUI, ...payload, id }))
})

describe('EditPaymentMethodForm', () => {
  it('preloads the name and shows the code as read only', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Nequi')
    expect(screen.getByText('NEQUI')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Código' })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'El código no se puede cambiar porque identifica el método en las ventas registradas.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Las ventas anteriores mostrarán el nuevo nombre.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  it('sends only the new name', async () => {
    const { user, onUpdated } = renderForm()

    await rename(user, ' Nequi QR ')

    expect(updateMethod).toHaveBeenCalledWith('pm-nequi', { name: 'Nequi QR' }, 'test-token')
    expect(onUpdated).toHaveBeenCalledWith({ ...NEQUI, name: 'Nequi QR' })
  })

  it.each([
    ['without editing', null],
    ['when only surrounding spaces were added', ' Nequi '],
  ])('does not call the api %s', async (_label, value) => {
    const { user } = renderForm()

    if (value) {
      await user.clear(screen.getByLabelText('Nombre'))
      await user.type(screen.getByLabelText('Nombre'), value)
    }
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it.each([
    ['empty', ''],
    ['made only of spaces', '   '],
  ])('requires a name when it is %s', async (_label, value) => {
    const { user } = renderForm()

    await rename(user, value)

    expect(await screen.findByText('Ingresa el nombre del método de pago')).toBeInTheDocument()
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it('marks and focuses the name when another method already uses it', async () => {
    updateMethod.mockRejectedValue(
      new ApiError('Conflict', 409, {}, 'PAYMENT_METHOD_NAME_ALREADY_EXISTS'),
    )
    const { user, onUpdated } = renderForm()

    await rename(user, 'Efectivo')
    await screen.findByText('Ya existe un método de pago con ese nombre. Usa otro.')

    const nameField = screen.getByLabelText('Nombre')
    expect(nameField).toHaveAttribute('aria-invalid', 'true')
    expect(nameField).toHaveAttribute(
      'aria-describedby',
      'edit-payment-method-name-error edit-payment-method-name-hint',
    )
    await waitFor(() => expect(document.activeElement).toBe(nameField))
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('explains when the method no longer exists', async () => {
    updateMethod.mockRejectedValue(new ApiError('Missing', 404, {}, 'PAYMENT_METHOD_NOT_FOUND'))
    const { user } = renderForm()

    await rename(user, 'Nequi QR')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este método de pago ya no existe. Recarga el listado.',
    )
  })
})

describe('EditPaymentMethodForm validation', () => {
  it('rejects a name that is too short', async () => {
    const { user } = renderForm()

    await rename(user, 'QR')

    expect(
      await screen.findByText('El nombre debe tener al menos 3 caracteres'),
    ).toBeInTheDocument()
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it('rejects a name with more than 100 characters', async () => {
    const { user } = renderForm()

    await rename(user, 'N'.repeat(101))

    expect(await screen.findByText('El nombre no puede superar 100 caracteres')).toBeInTheDocument()
    expect(updateMethod).not.toHaveBeenCalled()
  })
})

describe('EditPaymentMethodForm submission', () => {
  it('cancels without calling the api', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it('shows the saving label and disables both actions while pending', async () => {
    updateMethod.mockReturnValue(new Promise<never>(() => {}))
    const { user } = renderForm()

    await rename(user, 'Nequi QR')

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('clears the server error after a successful retry', async () => {
    updateMethod.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user, onUpdated } = renderForm()

    await rename(user, 'Nequi QR')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible guardar los cambios. Intenta de nuevo.',
    )

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    [403, 'No tienes permiso para realizar esta acción.'],
    [400, 'Revisa los datos: hay un campo que el servidor no aceptó.'],
    [500, 'No fue posible guardar los cambios. Intenta de nuevo.'],
  ])('shows the message for a %i response', async (status, message) => {
    updateMethod.mockRejectedValue(new ApiError('Failed', status, {}, 'UNKNOWN'))
    const { user, onUpdated } = renderForm()

    await rename(user, 'Nequi QR')

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('preloads the new name when the payment method changes', () => {
    const onUpdated = vi.fn()
    const onCancel = vi.fn()
    const { rerender } = render(
      <EditPaymentMethodForm paymentMethod={NEQUI} onUpdated={onUpdated} onCancel={onCancel} />,
    )

    rerender(
      <EditPaymentMethodForm
        paymentMethod={{ ...NEQUI, name: 'Nequi QR' }}
        onUpdated={onUpdated}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByLabelText('Nombre')).toHaveValue('Nequi QR')
  })
})
