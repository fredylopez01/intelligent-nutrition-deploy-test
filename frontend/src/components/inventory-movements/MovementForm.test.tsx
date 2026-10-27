import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { generalStockService } from '../../services/generalStock.service'
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

import { MovementForm } from './MovementForm'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { listByBranch: vi.fn(), getProductInBranch: vi.fn() },
}))

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn() },
}))

vi.mock('../../services/inventoryMovements.service', () => ({
  inventoryMovementsService: { create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createMovement = vi.mocked(inventoryMovementsService.create)
const getProductInBranch = vi.mocked(inventoryService.getProductInBranch)
const listByBranch = vi.mocked(inventoryService.listByBranch)
const getGeneralStock = vi.mocked(generalStockService.getByProduct)

function renderForm(branches = [CENTRO]) {
  const onRegistered = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
  render(
    <MovementForm
      branches={branches}
      defaultBranchId={CENTRO.id}
      onRegistered={onRegistered}
      onCancel={onCancel}
    />,
  )
  return { user, onRegistered, onCancel }
}

async function pickWhey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Whey Protein 2 lb/ }))
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00.000Z'), shouldAdvanceTime: true })
  vi.resetAllMocks()
  listByBranch.mockResolvedValue(inventoryPage([WHEY_ITEM]))
  getProductInBranch.mockResolvedValue(
    wheyDetail([
      { expirationDate: '2026-10-01', quantity: 4 },
      { expirationDate: '2027-01-31', quantity: 8 },
      { expirationDate: '2027-06-30', quantity: 3 },
    ]),
  )
  getGeneralStock.mockResolvedValue({
    product: { id: WHEY_ITEM.product.id, name: 'Whey Protein 2 lb' },
    totalQuantity: 42,
    lots: [
      { id: 'g-1', expirationDate: '2026-09-30', quantity: 2, expired: true },
      { id: 'g-2', expirationDate: '2027-03-31', quantity: 40, expired: false },
    ],
  } as never)
  createMovement.mockResolvedValue(buildRegistered())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MovementForm exit', () => {
  it('proposes the earliest current lot and sends the exit with its reason', async () => {
    const { user, onRegistered } = renderForm()
    await pickWhey(user)

    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))
    expect(
      screen.getByRole('option', { name: /Vence 1 oct 2026 · 4 und · vencido/ }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Cantidad'), '3')
    await user.type(screen.getByLabelText('Motivo de la salida'), 'Empaque roto en bodega')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    await waitFor(() =>
      expect(createMovement).toHaveBeenCalledWith(
        {
          branchId: CENTRO.id,
          productId: WHEY_ITEM.product.id,
          movementType: 'EXIT',
          quantity: 3,
          expirationDate: '2027-01-31',
          observation: 'Empaque roto en bodega',
        },
        'test-token',
      ),
    )
    expect(onRegistered).toHaveBeenCalled()
  })

  it('lets the user write off an expired lot', async () => {
    const { user } = renderForm()
    await pickWhey(user)
    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))

    await user.selectOptions(screen.getByLabelText('Lote de la sede'), '2026-10-01')
    await user.type(screen.getByLabelText('Cantidad'), '4')
    await user.type(screen.getByLabelText('Motivo de la salida'), 'Producto vencido')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    await waitFor(() =>
      expect(createMovement).toHaveBeenCalledWith(
        expect.objectContaining({ expirationDate: '2026-10-01', quantity: 4 }),
        'test-token',
      ),
    )
  })

  it('requires the reason of the exit', async () => {
    const { user } = renderForm()
    await pickWhey(user)
    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))

    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    expect(
      await screen.findByText('Escribe el motivo de la salida, por ejemplo "Producto dañado".'),
    ).toBeInTheDocument()
    expect(createMovement).not.toHaveBeenCalled()
  })

  it('stops a quantity above the lot before calling the api', async () => {
    const { user } = renderForm()
    await pickWhey(user)
    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))

    await user.type(screen.getByLabelText('Cantidad'), '9')
    await user.type(screen.getByLabelText('Motivo de la salida'), 'Empaque roto')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    expect(await screen.findByText('El lote solo tiene 8 und en la sede.')).toBeInTheDocument()
    expect(createMovement).not.toHaveBeenCalled()
  })

  it('shows the branch stock and the stock after the movement', async () => {
    const { user } = renderForm()
    await pickWhey(user)
    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))

    await user.type(screen.getByLabelText('Cantidad'), '5')

    expect(screen.getByText('15 und')).toBeInTheDocument()
    expect(screen.getByText('10 und')).toBeInTheDocument()
  })

  it('asks for the product before sending', async () => {
    const { user } = renderForm()
    await screen.findByRole('button', { name: /Whey Protein 2 lb/ })

    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    expect(await screen.findByText('Elige el producto del movimiento.')).toBeInTheDocument()
  })
})

describe('MovementForm entry', () => {
  it('offers only current general stock lots and sends the entry without observation', async () => {
    const { user } = renderForm()
    await user.click(screen.getByLabelText(/Entrada/))
    await pickWhey(user)

    await waitFor(() =>
      expect(screen.getByLabelText('Lote del stock general')).toHaveValue('2027-03-31'),
    )
    expect(screen.queryByRole('option', { name: /30 sept 2026/ })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Cantidad'), '10')
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }))

    await waitFor(() =>
      expect(createMovement).toHaveBeenCalledWith(
        {
          branchId: CENTRO.id,
          productId: WHEY_ITEM.product.id,
          movementType: 'ENTRY',
          quantity: 10,
          expirationDate: '2027-03-31',
        },
        'test-token',
      ),
    )
  })

  it('explains that there is nothing to bring from the general stock', async () => {
    getGeneralStock.mockResolvedValue({
      product: { id: WHEY_ITEM.product.id },
      totalQuantity: 0,
      lots: [],
    } as never)
    const { user } = renderForm()
    await user.click(screen.getByLabelText(/Entrada/))
    await pickWhey(user)

    expect(
      await screen.findByText(/no tiene unidades vigentes en el stock general/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeDisabled()
  })

  it('marks the quantity with the general stock error from the api', async () => {
    createMovement.mockRejectedValue(
      new ApiError('Short', 422, { available: 6 }, 'INSUFFICIENT_GENERAL_STOCK'),
    )
    const { user } = renderForm()
    await user.click(screen.getByLabelText(/Entrada/))
    await pickWhey(user)
    await waitFor(() =>
      expect(screen.getByLabelText('Lote del stock general')).toHaveValue('2027-03-31'),
    )

    await user.type(screen.getByLabelText('Cantidad'), '10')
    await user.click(screen.getByRole('button', { name: 'Registrar entrada' }))

    expect(
      await screen.findByText('El stock general solo tiene 6 und de este lote.'),
    ).toBeInTheDocument()
  })
})

describe('MovementForm branch and errors', () => {
  it('lets a user with several branches choose where to register', async () => {
    const { user } = renderForm([CENTRO, NORTE])
    await screen.findByRole('button', { name: /Whey Protein 2 lb/ })

    await user.selectOptions(screen.getByLabelText('Sede'), NORTE.id)

    await waitFor(() =>
      expect(listByBranch).toHaveBeenLastCalledWith(
        NORTE.id,
        expect.objectContaining({ page: 1 }),
        'test-token',
      ),
    )
  })

  it('explains a closed day', async () => {
    createMovement.mockRejectedValue(new ApiError('Closed', 422, {}, 'INVENTORY_CLOSED'))
    const { user } = renderForm()
    await pickWhey(user)
    await waitFor(() => expect(screen.getByLabelText('Lote de la sede')).toHaveValue('2027-01-31'))

    await user.type(screen.getByLabelText('Cantidad'), '1')
    await user.type(screen.getByLabelText('Motivo de la salida'), 'Empaque roto')
    await user.click(screen.getByRole('button', { name: 'Registrar salida' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('ya se cerró hoy')
  })

  it('cancels without sending', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
