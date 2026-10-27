import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { inventoryMovementsService } from '../../services/inventoryMovements.service'
import {
  CENTRO,
  NORTE,
  WHEY_ITEM,
  buildRegistered,
  inventoryPage,
  wheyDetail,
} from '../../test-utils/inventoryMovements'

import { TransferForm } from './TransferForm'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { listByBranch: vi.fn(), getProductInBranch: vi.fn(), availability: vi.fn() },
}))

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn() },
}))

vi.mock('../../services/inventoryMovements.service', () => ({
  inventoryMovementsService: { transfer: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const transfer = vi.mocked(inventoryMovementsService.transfer)

function renderForm(originBranches = [CENTRO]) {
  const onRegistered = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
  render(
    <TransferForm
      originBranches={originBranches}
      defaultOriginId={CENTRO.id}
      onRegistered={onRegistered}
      onCancel={vi.fn()}
    />,
  )
  return { user, onRegistered }
}

async function pickWhey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
  await waitFor(() =>
    expect(screen.getByLabelText('Lote de la sede origen')).toHaveValue('2027-01-31'),
  )
  await waitFor(() => expect(screen.getByLabelText('Sede destino')).toBeEnabled())
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00.000Z'), shouldAdvanceTime: true })
  vi.resetAllMocks()
  vi.mocked(inventoryService.listByBranch).mockResolvedValue(inventoryPage([WHEY_ITEM]))
  vi.mocked(inventoryService.getProductInBranch).mockResolvedValue(
    wheyDetail([
      { expirationDate: '2026-10-01', quantity: 4 },
      { expirationDate: '2027-01-31', quantity: 8 },
    ]),
  )
  vi.mocked(inventoryService.availability).mockResolvedValue({
    product: { id: WHEY_ITEM.product.id, name: 'Whey Protein 2 lb', referenceCode: 'WHEY-2LB' },
    branches: [
      { branchId: CENTRO.id, branchName: 'Centro', quantity: 8 },
      { branchId: NORTE.id, branchName: 'Norte', quantity: 2 },
    ],
  })
  transfer.mockResolvedValue(
    buildRegistered({ movementType: 'TRANSFER', originResultingQuantity: 6 }),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TransferForm', () => {
  it('moves the earliest current lot to the chosen destination', async () => {
    const { user, onRegistered } = renderForm()
    await pickWhey(user)

    expect(screen.queryByRole('option', { name: /vencido/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Centro/ })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Sede destino'), NORTE.id)
    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.type(screen.getByLabelText('Observación (opcional)'), 'Reposición')
    await user.click(screen.getByRole('button', { name: 'Registrar traslado' }))

    await waitFor(() =>
      expect(transfer).toHaveBeenCalledWith(
        {
          originBranchId: CENTRO.id,
          branchId: NORTE.id,
          productId: WHEY_ITEM.product.id,
          quantity: 2,
          expirationDate: '2027-01-31',
          observation: 'Reposición',
        },
        'test-token',
      ),
    )
    expect(onRegistered).toHaveBeenCalled()
  })

  it('starts with the product and destination requested from the availability', async () => {
    const onRegistered = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    render(
      <TransferForm
        originBranches={[CENTRO, NORTE]}
        defaultOriginId={CENTRO.id}
        initialItem={{ ...WHEY_ITEM, totalQuantity: 8 }}
        defaultDestinationId={NORTE.id}
        onRegistered={onRegistered}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/8 und en Centro/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Lote de la sede origen')).toHaveValue('2027-01-31'),
    )
    await waitFor(() => expect(screen.getByLabelText('Sede destino')).toHaveValue(NORTE.id))
    await user.type(screen.getByLabelText('Cantidad'), '3')
    await user.click(screen.getByRole('button', { name: 'Registrar traslado' }))

    await waitFor(() =>
      expect(transfer).toHaveBeenCalledWith(
        expect.objectContaining({ originBranchId: CENTRO.id, branchId: NORTE.id, quantity: 3 }),
        'test-token',
      ),
    )
    expect(inventoryService.listByBranch).not.toHaveBeenCalled()
  })

  it('shows how many current units each destination has', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    expect(screen.getByRole('option', { name: 'Norte · 2 und vigentes' })).toBeInTheDocument()
  })

  it('requires the destination', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.click(screen.getByRole('button', { name: 'Registrar traslado' }))

    expect(await screen.findByText('Elige la sede destino.')).toBeInTheDocument()
    expect(transfer).not.toHaveBeenCalled()
  })

  it('stops a quantity above the origin lot', async () => {
    const { user } = renderForm()
    await pickWhey(user)

    await user.selectOptions(screen.getByLabelText('Sede destino'), NORTE.id)
    await user.type(screen.getByLabelText('Cantidad'), '9')
    await user.click(screen.getByRole('button', { name: 'Registrar traslado' }))

    expect(await screen.findByText('El lote solo tiene 8 und en Centro.')).toBeInTheDocument()
  })

  it('explains that the destination does not have the product assigned', async () => {
    transfer.mockRejectedValue(new ApiError('No', 404, {}, 'PRODUCT_NOT_ASSIGNED_IN_DESTINATION'))
    const { user } = renderForm()
    await pickWhey(user)

    await user.selectOptions(screen.getByLabelText('Sede destino'), NORTE.id)
    await user.type(screen.getByLabelText('Cantidad'), '2')
    await user.click(screen.getByRole('button', { name: 'Registrar traslado' }))

    expect(
      await screen.findByText(/El producto no está asignado en la sede destino/),
    ).toBeInTheDocument()
  })

  it('warns when the origin only has expired or empty lots', async () => {
    vi.mocked(inventoryService.getProductInBranch).mockResolvedValue(
      wheyDetail([{ expirationDate: '2026-10-01', quantity: 4 }]),
    )
    const { user } = renderForm()
    await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))

    expect(await screen.findByText(/Los lotes vencidos no se trasladan/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar traslado' })).toBeDisabled()
  })

  it('lets the superadmin choose the origin branch', async () => {
    const { user } = renderForm([CENTRO, NORTE])
    await screen.findByRole('button', { name: /Whey Protein 2 lb/ })

    await user.selectOptions(screen.getByLabelText('Sede origen'), NORTE.id)

    await waitFor(() =>
      expect(inventoryService.listByBranch).toHaveBeenLastCalledWith(
        NORTE.id,
        expect.anything(),
        'test-token',
      ),
    )
  })
})
