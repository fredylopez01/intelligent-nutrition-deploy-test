import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { paymentMethodsService } from '../../services/paymentMethods.service'

import { CreatePaymentMethodForm } from './CreatePaymentMethodForm'

vi.mock('../../services/paymentMethods.service', () => ({
  paymentMethodsService: { create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createMethod = vi.mocked(paymentMethodsService.create)

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<CreatePaymentMethodForm onCreated={onCreated} onCancel={onCancel} />)
  return { user, onCreated, onCancel }
}

async function fill(user: ReturnType<typeof userEvent.setup>, code: string, name: string) {
  if (code) await user.type(screen.getByLabelText('Código'), code)
  if (name) await user.type(screen.getByLabelText('Nombre'), name)
  await user.click(screen.getByRole('button', { name: 'Registrar método' }))
}

function pendingRequest() {
  return new Promise<never>(() => {})
}

beforeEach(() => {
  vi.resetAllMocks()
  createMethod.mockImplementation((payload) =>
    Promise.resolve({ id: 'pm-new', active: true, ...payload }),
  )
})

describe('CreatePaymentMethodForm', () => {
  it('sends the code in uppercase and the trimmed name', async () => {
    const { user, onCreated } = renderForm()

    await fill(user, ' bank_transfer_2 ', '  Transferencia  ')

    await waitFor(() =>
      expect(createMethod).toHaveBeenCalledWith(
        { code: 'BANK_TRANSFER_2', name: 'Transferencia' },
        'test-token',
      ),
    )
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pm-new', code: 'BANK_TRANSFER_2' }),
    )
  })

  it('asks for both fields before sending', async () => {
    const { user } = renderForm()

    await fill(user, '', '')

    expect(await screen.findByText('Ingresa el código del método de pago')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre del método de pago')).toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a space',
      'BANK TRANSFER',
      'El código no lleva espacios. Usa guion bajo, por ejemplo BANK_TRANSFER.',
    ],
    ['a hyphen', 'BANK-TRANSFER', 'Usa solo letras sin tilde, números y guion bajo (A-Z, 0-9, _).'],
    ['an accent', 'CRÉDITO', 'Usa solo letras sin tilde, números y guion bajo (A-Z, 0-9, _).'],
    ['more than 30 characters', 'A'.repeat(31), 'El código no puede superar 30 caracteres'],
  ])('rejects a code with %s', async (_label, code, message) => {
    const { user } = renderForm()

    await fill(user, code, 'Método')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it('rejects a name that is too short', async () => {
    const { user } = renderForm()

    await fill(user, 'QR', 'QR')

    expect(
      await screen.findByText('El nombre debe tener al menos 3 caracteres'),
    ).toBeInTheDocument()
  })

  it.each([
    [
      'PAYMENT_METHOD_CODE_ALREADY_EXISTS',
      'Código',
      'Ya existe un método de pago con ese código. Usa otro.',
    ],
    [
      'PAYMENT_METHOD_NAME_ALREADY_EXISTS',
      'Nombre',
      'Ya existe un método de pago con ese nombre. Usa otro.',
    ],
  ])('marks the repeated field when the api answers %s', async (code, label, message) => {
    createMethod.mockRejectedValue(new ApiError('Conflict', 409, {}, code))
    const { user, onCreated } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('shows a general error when the server fails', async () => {
    createMethod.mockRejectedValue(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible registrar el método de pago. Intenta de nuevo.',
    )
  })

  it('cancels without sending', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(createMethod).not.toHaveBeenCalled()
  })
})

describe('CreatePaymentMethodForm render', () => {
  it('renders the code and name fields with their hints and the availability note', () => {
    renderForm()

    expect(screen.getByLabelText('Código')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Hasta 30 caracteres: letras, números y guion bajo. Se guarda en mayúsculas y no se puede cambiar después.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Es el nombre que verá el cajero en el punto de venta.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('El método queda activo y disponible en el punto de venta al registrarlo.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar método' })).toBeInTheDocument()
  })
})

describe('CreatePaymentMethodForm initial state', () => {
  it('creates the method already active without sending the status', async () => {
    const { user, onCreated } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')

    await waitFor(() =>
      expect(createMethod).toHaveBeenCalledWith({ code: 'NEQUI', name: 'Nequi' }, 'test-token'),
    )
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NEQUI', name: 'Nequi', active: true }),
    )
  })
})

describe('CreatePaymentMethodForm validation', () => {
  it('rejects a name with more than 100 characters', async () => {
    const { user } = renderForm()

    await fill(user, 'NEQUI', 'N'.repeat(101))

    expect(await screen.findByText('El nombre no puede superar 100 caracteres')).toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it('accepts the exact length limits', async () => {
    const { user, onCreated } = renderForm()
    const code = 'A'.repeat(30)
    const name = 'N'.repeat(100)

    await fill(user, code, name)

    await waitFor(() => expect(createMethod).toHaveBeenCalledWith({ code, name }, 'test-token'))
    expect(onCreated).toHaveBeenCalled()
  })

  it('treats a code made only of spaces as missing', async () => {
    const { user } = renderForm()

    await fill(user, '   ', 'Método')

    expect(await screen.findByText('Ingresa el código del método de pago')).toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it('treats a name made only of spaces as missing', async () => {
    const { user } = renderForm()

    await fill(user, 'NEQUI', '   ')

    expect(await screen.findByText('Ingresa el nombre del método de pago')).toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it('marks both fields when they are empty', async () => {
    const { user } = renderForm()

    await fill(user, '', '')

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2))
    expect(screen.getByLabelText('Código')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nombre')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('CreatePaymentMethodForm accessibility', () => {
  it('describes the fields with their hint and error messages', async () => {
    const { user } = renderForm()

    expect(screen.getByLabelText('Código')).toHaveAttribute(
      'aria-describedby',
      'create-payment-method-code-hint',
    )

    await fill(user, 'BANK TRANSFER', 'Método')

    const codeField = screen.getByLabelText('Código')
    expect(await screen.findByText(/El código no lleva espacios/)).toBeInTheDocument()
    expect(codeField).toHaveAttribute(
      'aria-describedby',
      'create-payment-method-code-error create-payment-method-code-hint',
    )
  })

  it.each([
    ['PAYMENT_METHOD_CODE_ALREADY_EXISTS', 'Código'],
    ['PAYMENT_METHOD_NAME_ALREADY_EXISTS', 'Nombre'],
  ])('focuses the repeated field when the api answers %s', async (code, label) => {
    createMethod.mockRejectedValue(new ApiError('Conflict', 409, {}, code))
    const { user } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')
    await screen.findByText(/Ya existe un método de pago con ese/)

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(label)))
  })
})

describe('CreatePaymentMethodForm submission state', () => {
  it('shows the submitting label and disables both actions while pending', async () => {
    createMethod.mockReturnValue(pendingRequest())
    const { user } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')

    expect(await screen.findByRole('button', { name: 'Registrando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it('clears the server error after a successful retry', async () => {
    createMethod.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user, onCreated } = renderForm()

    await fill(user, 'NEQUI', 'Nequi')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible registrar el método de pago. Intenta de nuevo.',
    )

    await user.click(screen.getByRole('button', { name: 'Registrar método' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
