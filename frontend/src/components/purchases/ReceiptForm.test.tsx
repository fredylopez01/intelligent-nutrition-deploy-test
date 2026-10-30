import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { purchasesService } from '../../services/purchases.service'
import { buildPurchase } from '../../test-utils/purchases'

import { ReceiptForm } from './ReceiptForm'

vi.mock('../../services/purchases.service', () => ({
  purchasesService: { receive: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const receive = vi.mocked(purchasesService.receive)

function renderForm(purchase = buildPurchase()) {
  const onReceived = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
  render(<ReceiptForm purchase={purchase} onReceived={onReceived} onCancel={onCancel} />)
  return { user, onReceived, onCancel }
}

const field = (label: string) => screen.getByLabelText(label)

const confirm = () => screen.getByRole('button', { name: 'Confirmar recepción' })

async function fillExpirations(user: ReturnType<typeof userEvent.setup>) {
  await user.type(field('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
  await user.type(field('Vencimiento de Creatina 300 g, lote 1'), '2027-06-30')
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00.000Z'), shouldAdvanceTime: true })
  vi.resetAllMocks()
  receive.mockResolvedValue(buildPurchase({ status: 'PARTIALLY_RECEIVED' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReceiptForm', () => {
  it('renders the receipt form with the pending lines', () => {
    renderForm()

    expect(
      screen.getByText(/Lo recibido entra al stock general con su fecha de vencimiento/),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Líneas por recibir' })).toBeInTheDocument()
    expect(screen.getByText('WHEY-2LB · faltan 15 de 20')).toBeInTheDocument()
    expect(field('Cantidad recibida de Whey Protein 2 lb, lote 1')).toHaveValue('15')
    expect(field('Vencimiento de Whey Protein 2 lb, lote 1')).toHaveAttribute('min', '2026-10-26')
    expect(field('Observación de Whey Protein 2 lb, lote 1')).toHaveAttribute(
      'placeholder',
      'Opcional',
    )
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(confirm()).toBeEnabled()
  })

  it('hides the lines that are already complete', () => {
    const purchase = buildPurchase()
    renderForm({
      ...purchase,
      items: [{ ...purchase.items[0], receivedQuantity: 20, received: true }, purchase.items[1]],
    })

    expect(
      screen.queryByLabelText('Cantidad recibida de Whey Protein 2 lb, lote 1'),
    ).not.toBeInTheDocument()
    expect(field('Cantidad recibida de Creatina 300 g, lote 1')).toHaveValue('15')
  })

  it('proposes the pending units of each line', () => {
    renderForm()

    expect(field('Cantidad recibida de Whey Protein 2 lb, lote 1')).toHaveValue('15')
    expect(field('Cantidad recibida de Creatina 300 g, lote 1')).toHaveValue('15')
    expect(screen.getByText('WHEY-2LB · faltan 15 de 20')).toBeInTheDocument()
  })

  it('sends one row per lot and skips lines with zero', async () => {
    const { user, onReceived } = renderForm()

    await user.clear(field('Cantidad recibida de Whey Protein 2 lb, lote 1'))
    await user.type(field('Cantidad recibida de Whey Protein 2 lb, lote 1'), '10')
    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
    await user.click(screen.getByRole('button', { name: 'Agregar otro lote de Whey Protein 2 lb' }))
    await user.type(field('Cantidad recibida de Whey Protein 2 lb, lote 2'), '5')
    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 2'), '2027-09-30')
    await user.type(field('Observación de Whey Protein 2 lb, lote 2'), 'Caja golpeada')
    await user.clear(field('Cantidad recibida de Creatina 300 g, lote 1'))
    await user.type(field('Cantidad recibida de Creatina 300 g, lote 1'), '0')
    await user.click(confirm())

    await waitFor(() =>
      expect(receive).toHaveBeenCalledWith(
        'purchase-1',
        [
          { purchaseDetailId: 'detail-whey', receivedQuantity: 10, expirationDate: '2027-06-30' },
          {
            purchaseDetailId: 'detail-whey',
            receivedQuantity: 5,
            expirationDate: '2027-09-30',
            observation: 'Caja golpeada',
          },
        ],
        'test-token',
      ),
    )
    expect(onReceived).toHaveBeenCalledWith(buildPurchase({ status: 'PARTIALLY_RECEIVED' }))
  })

  it('removes an extra lot row', async () => {
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Agregar otro lote de Whey Protein 2 lb' }))
    expect(field('Cantidad recibida de Whey Protein 2 lb, lote 2')).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb, lote 2' }))

    expect(
      screen.queryByLabelText('Cantidad recibida de Whey Protein 2 lb, lote 2'),
    ).not.toBeInTheDocument()
    expect(field('Cantidad recibida de Whey Protein 2 lb, lote 1')).toBeInTheDocument()
  })

  it('asks for the expiration of every received lot', async () => {
    const { user } = renderForm()

    await user.click(confirm())

    expect(await screen.findAllByText('Escribe el vencimiento del lote.')).toHaveLength(2)
    expect(receive).not.toHaveBeenCalled()
  })

  it('rejects an expired lot and more units than pending', async () => {
    const { user } = renderForm()

    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 1'), '2026-01-31')
    await user.clear(field('Cantidad recibida de Creatina 300 g, lote 1'))
    await user.type(field('Cantidad recibida de Creatina 300 g, lote 1'), '16')
    await user.type(field('Vencimiento de Creatina 300 g, lote 1'), '2027-06-30')
    await user.click(confirm())

    expect(
      await screen.findByText('El lote ya está vencido: no puede entrar al stock general.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Solo faltan 15 por recibir en esta línea.')).toBeInTheDocument()
  })

  it('rejects a fractional quantity', async () => {
    const { user } = renderForm()

    await user.clear(field('Cantidad recibida de Whey Protein 2 lb, lote 1'))
    await user.type(field('Cantidad recibida de Whey Protein 2 lb, lote 1'), '1.5')
    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
    await user.click(confirm())

    expect(await screen.findByText('Cantidad entera de 0 en adelante.')).toBeInTheDocument()
    expect(receive).not.toHaveBeenCalled()
  })

  it('explains that at least one quantity is needed', async () => {
    const { user } = renderForm()

    await user.clear(field('Cantidad recibida de Whey Protein 2 lb, lote 1'))
    await user.clear(field('Cantidad recibida de Creatina 300 g, lote 1'))
    await user.click(confirm())

    expect(await screen.findByText('Escribe al menos una cantidad recibida.')).toBeInTheDocument()
    expect(receive).not.toHaveBeenCalled()
  })

  it('asks to join two rows with the same expiration', async () => {
    const { user } = renderForm()

    await user.clear(field('Cantidad recibida de Whey Protein 2 lb, lote 1'))
    await user.type(field('Cantidad recibida de Whey Protein 2 lb, lote 1'), '5')
    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
    await user.click(screen.getByRole('button', { name: 'Agregar otro lote de Whey Protein 2 lb' }))
    await user.type(field('Cantidad recibida de Whey Protein 2 lb, lote 2'), '5')
    await user.type(field('Vencimiento de Whey Protein 2 lb, lote 2'), '2027-06-30')
    await user.clear(field('Cantidad recibida de Creatina 300 g, lote 1'))
    await user.click(confirm())

    expect(
      await screen.findByText('Dos lotes tienen el mismo vencimiento: súmalos en una sola fila.'),
    ).toBeInTheDocument()
  })

  it('shows the progress while the receipt is registered', async () => {
    receive.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()

    await fillExpirations(user)
    await user.click(confirm())

    expect(await screen.findByRole('button', { name: 'Registrando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(field('Cantidad recibida de Whey Protein 2 lb, lote 1')).toBeDisabled()
  })

  it('cancels without receiving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalled()
    expect(receive).not.toHaveBeenCalled()
  })

  it('shows the api error', async () => {
    receive.mockRejectedValue(new ApiError('Done', 409, {}, 'PURCHASE_ALREADY_RECEIVED'))
    const { user } = renderForm()

    await fillExpirations(user)
    await user.click(confirm())

    expect(await screen.findByText(/La compra ya se recibió completa/)).toBeInTheDocument()
  })

  it('explains an unexpected failure', async () => {
    receive.mockRejectedValue(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderForm()

    await fillExpirations(user)
    await user.click(confirm())

    expect(
      await screen.findByText('No fue posible registrar la recepción. Intenta de nuevo.'),
    ).toBeInTheDocument()
  })
})
