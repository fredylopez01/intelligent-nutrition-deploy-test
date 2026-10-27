import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { salesService } from '../../services/sales.service'
import { buildSale } from '../../test-utils/sales'

import { ReverseSaleForm } from './ReverseSaleForm'

vi.mock('../../services/sales.service', () => ({
  salesService: { reverse: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const reverse = vi.mocked(salesService.reverse)

function renderForm() {
  const onReversed = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<ReverseSaleForm sale={buildSale()} onReversed={onReversed} onCancel={onCancel} />)
  return { user, onReversed, onCancel }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ReverseSaleForm', () => {
  it('explains what happens to the stock', () => {
    renderForm()

    expect(
      screen.getByText(/las 2 unidades vuelven a los lotes de donde salieron en Centro/),
    ).toBeInTheDocument()
  })

  it('requires a reason of at least 10 characters', async () => {
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Error')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(
      await screen.findByText('Explica el motivo con al menos 10 caracteres.'),
    ).toBeInTheDocument()
    expect(reverse).not.toHaveBeenCalled()
  })

  it('reverses with the trimmed reason', async () => {
    const reversed = buildSale({ status: 'REVERSED' })
    reverse.mockResolvedValue(reversed)
    const { user, onReversed } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), '  Sabor equivocado  ')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    await waitFor(() => expect(onReversed).toHaveBeenCalledWith(reversed))
    expect(reverse).toHaveBeenCalledWith('sale-1', 'Sabor equivocado', 'test-token')
  })

  it.each([
    ['SALE_DAY_CLOSED', 422, 'El inventario del día de esta venta ya se cerró'],
    ['SALE_ALREADY_REVERSED', 409, 'Esta venta ya fue reversada'],
  ])('explains %s', async (code, status, message) => {
    reverse.mockRejectedValue(new ApiError('No', status, {}, code))
    const { user, onReversed } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Sabor equivocado')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument()
    expect(onReversed).not.toHaveBeenCalled()
  })

  it('cancels without reversing', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
