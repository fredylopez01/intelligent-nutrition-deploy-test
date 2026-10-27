import { render, screen } from '@testing-library/react'
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
  })

  it('sends only the new name', async () => {
    const { user, onUpdated } = renderForm()

    await rename(user, ' Nequi QR ')

    expect(updateMethod).toHaveBeenCalledWith('pm-nequi', { name: 'Nequi QR' }, 'test-token')
    expect(onUpdated).toHaveBeenCalledWith({ ...NEQUI, name: 'Nequi QR' })
  })

  it('does not call the api when the name did not change', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it('requires a name', async () => {
    const { user } = renderForm()

    await rename(user, '')

    expect(await screen.findByText('Ingresa el nombre del método de pago')).toBeInTheDocument()
    expect(updateMethod).not.toHaveBeenCalled()
  })

  it('marks the name when another method already uses it', async () => {
    updateMethod.mockRejectedValue(
      new ApiError('Conflict', 409, {}, 'PAYMENT_METHOD_NAME_ALREADY_EXISTS'),
    )
    const { user, onUpdated } = renderForm()

    await rename(user, 'Efectivo')

    expect(
      await screen.findByText('Ya existe un método de pago con ese nombre. Usa otro.'),
    ).toBeInTheDocument()
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
