import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { inventoryMovementsService } from '../../services/inventoryMovements.service'
import {
  CENTRO,
  WHEY_ITEM,
  buildRegistered,
  inventoryPage,
  wheyDetail,
} from '../../test-utils/inventoryMovements'

import { AdjustmentForm } from './AdjustmentForm'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { listByBranch: vi.fn(), getProductInBranch: vi.fn() },
}))

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn() },
}))

vi.mock('../../services/inventoryMovements.service', () => ({
  inventoryMovementsService: { adjust: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const adjust = vi.mocked(inventoryMovementsService.adjust)
const reason = 'Diferencia detectada en el conteo físico'

function renderForm() {
  const onRegistered = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
  render(
    <AdjustmentForm
      branches={[CENTRO]}
      defaultBranchId={CENTRO.id}
      onRegistered={onRegistered}
      onCancel={vi.fn()}
    />,
  )
  return { user, onRegistered }
}

async function pickWhey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
  await waitFor(() => expect(screen.getByLabelText('Lote')).toBeEnabled())
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00.000Z'), shouldAdvanceTime: true })
  vi.resetAllMocks()
  vi.mocked(inventoryService.listByBranch).mockResolvedValue(inventoryPage([WHEY_ITEM]))
  vi.mocked(inventoryService.getProductInBranch).mockResolvedValue(
    wheyDetail([
      { expirationDate: '2026-10-01', quantity: 0 },
      { expirationDate: '2027-01-31', quantity: 8 },
    ]),
  )
  adjust.mockResolvedValue(buildRegistered({ movementType: 'ADJUSTMENT_EXIT' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdjustmentForm', () => {
  it('sends an exit adjustment of the proposed lot with its reason', async () => {
    const { user, onRegistered } = renderForm()
    await pickWhey(user)

    expect(screen.getByLabelText('Lote')).toHaveValue('2027-01-31')
    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.type(screen.getByLabelText('Razón del ajuste'), reason)
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(
        {
          branchId: CENTRO.id,
          productId: WHEY_ITEM.product.id,
          movementType: 'ADJUSTMENT_EXIT',
          quantity: 2,
          expirationDate: '2027-01-31',
          reason,
        },
        'test-token',
      ),
    )
    expect(onRegistered).toHaveBeenCalled()
  })

  it('requires a reason of at least 10 characters', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.type(screen.getByLabelText('Razón del ajuste'), 'Conteo')
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(
      await screen.findByText('Explica el ajuste con al menos 10 caracteres.'),
    ).toBeInTheDocument()
    expect(adjust).not.toHaveBeenCalled()
  })

  it('adds an entry adjustment to a new lot with its expiration date', async () => {
    const { user } = renderForm()
    await user.click(screen.getByLabelText(/Ajuste de entrada/))
    await pickWhey(user)

    await user.selectOptions(screen.getByLabelText('Lote'), 'nuevo')
    await user.type(screen.getByLabelText('Vencimiento del lote nuevo'), '2027-09-30')
    await user.type(screen.getByLabelText('Cantidad'), '3')
    await user.type(screen.getByLabelText('Razón del ajuste'), reason)
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    await waitFor(() =>
      expect(adjust).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'ADJUSTMENT_ENTRY',
          expirationDate: '2027-09-30',
          quantity: 3,
        }),
        'test-token',
      ),
    )
  })

  it('asks for the date of the new lot', async () => {
    const { user } = renderForm()
    await user.click(screen.getByLabelText(/Ajuste de entrada/))
    await pickWhey(user)

    await user.selectOptions(screen.getByLabelText('Lote'), 'nuevo')
    await user.type(screen.getByLabelText('Cantidad'), '3')
    await user.type(screen.getByLabelText('Razón del ajuste'), reason)
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(
      await screen.findByText('Escribe la fecha de vencimiento del lote nuevo.'),
    ).toBeInTheDocument()
  })

  it('offers lots without units only for entry adjustments', async () => {
    const { user } = renderForm()
    await pickWhey(user)
    expect(screen.queryByRole('option', { name: /0 und/ })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText(/Ajuste de entrada/))

    expect(screen.getByRole('option', { name: /1 oct 2026 · 0 und/ })).toBeInTheDocument()
  })

  it('shows the api message when the adjustment fails', async () => {
    adjust.mockRejectedValue(new ApiError('Inactive', 422, {}, 'BRANCH_INACTIVE'))
    const { user } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.type(screen.getByLabelText('Razón del ajuste'), reason)
    await user.click(screen.getByRole('button', { name: 'Registrar ajuste' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La sede está inactiva')
  })
})
