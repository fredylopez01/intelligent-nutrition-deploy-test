import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { salesService } from '../../services/sales.service'
import { buildSale } from '../../test-utils/sales'
import type { Sale } from '../../types/sale'

import { ReverseSaleForm } from './ReverseSaleForm'

vi.mock('../../services/sales.service', () => ({
  salesService: { reverse: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const reverse = vi.mocked(salesService.reverse)

function withUnits(quantity: number): Sale {
  const sale = buildSale()
  return { ...sale, items: [{ ...sale.items[0], quantity }] }
}

function renderForm(sale = buildSale()) {
  const onReversed = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<ReverseSaleForm sale={sale} onReversed={onReversed} onCancel={onCancel} />)
  return { user, onReversed, onCancel }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ReverseSaleForm', () => {
  it.each([
    [1, 'la unidad vuelve al lote de donde salió en Centro'],
    [2, 'las 2 unidades vuelven a los lotes de donde salieron en Centro'],
  ])('explains what happens to the stock of %i unit(s)', (quantity, message) => {
    renderForm(withUnits(quantity))

    expect(screen.getByText(new RegExp(message))).toBeInTheDocument()
  })

  it.each(['', 'Error', '          '])(
    'requires a reason of at least 10 characters (%j)',
    async (reason) => {
      const { user } = renderForm()

      if (reason) await user.type(screen.getByLabelText('Motivo de la reversión'), reason)
      await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

      expect(
        await screen.findByText('Explica el motivo con al menos 10 caracteres.'),
      ).toBeInTheDocument()
      expect(reverse).not.toHaveBeenCalled()
    },
  )

  it('reverses with the trimmed reason', async () => {
    const reversed = buildSale({ status: 'REVERSED' })
    reverse.mockResolvedValue(reversed)
    const { user, onReversed } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), '  Sabor equivocado  ')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    await waitFor(() => expect(onReversed).toHaveBeenCalledWith(reversed))
    expect(reverse).toHaveBeenCalledWith('sale-1', 'Sabor equivocado', 'test-token')
  })

  it('shows the progress while the reversal is in flight', async () => {
    reverse.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Sabor equivocado')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(await screen.findByRole('button', { name: 'Reversando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it.each([
    ['SALE_DAY_CLOSED', 422, 'El inventario del día de esta venta ya se cerró'],
    ['SALE_ALREADY_REVERSED', 409, 'Esta venta ya fue reversada'],
    ['SALE_REVERSAL_NO_INVENTORY', 422, 'Uno de los productos ya no está asignado a la sede'],
  ])('explains %s', async (code, status, message) => {
    reverse.mockRejectedValue(new ApiError('No', status, {}, code))
    const { user, onReversed } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Sabor equivocado')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(await screen.findByText(new RegExp(message))).toBeInTheDocument()
    expect(onReversed).not.toHaveBeenCalled()
  })

  it('explains an unexpected failure', async () => {
    reverse.mockRejectedValue(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user, onReversed } = renderForm()

    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Sabor equivocado')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(
      await screen.findByText('No fue posible reversar la venta. Intenta de nuevo.'),
    ).toBeInTheDocument()
    expect(onReversed).not.toHaveBeenCalled()
  })

  it('cancels without reversing', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
