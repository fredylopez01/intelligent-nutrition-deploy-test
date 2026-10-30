import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { salesService } from '../../services/sales.service'
import { CASH, NEQUI } from '../../test-utils/paymentMethods'
import { buildSale, buildSellable } from '../../test-utils/sales'

import { CheckoutDialog } from './CheckoutDialog'
import type { SelectionLine } from './PosSelection'

vi.mock('../../services/sales.service', () => ({
  salesService: { create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createSale = vi.mocked(salesService.create)
const whey = buildSellable()

const charge = (amount = '290\\.000') =>
  screen.getByRole('button', { name: new RegExp(`Cobrar\\s+\\$\\s+${amount}`) })

function renderDialog(
  lines: SelectionLine[] = [{ product: whey, quantity: 2 }],
  overrides: { reference?: string; paymentMethod?: typeof CASH } = {},
) {
  const onCompleted = vi.fn()
  const onStockChanged = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  const { container } = render(
    <CheckoutDialog
      branch={{ id: 'branch-centro', name: 'Centro' }}
      lines={lines}
      paymentMethod={overrides.paymentMethod ?? CASH}
      reference={overrides.reference ?? ''}
      onCompleted={onCompleted}
      onStockChanged={onStockChanged}
      onCancel={onCancel}
    />,
  )
  return { user, onCompleted, onStockChanged, onCancel, container }
}

beforeEach(() => {
  vi.resetAllMocks()
  createSale.mockResolvedValue(buildSale())
})

describe('CheckoutDialog', () => {
  it('lists each line with its quantity, unit price and total', () => {
    const { container } = renderDialog()
    const lines = within(container.querySelector('.pos-checkout__lines') as HTMLElement)
    const summary = within(container.querySelector('.pos-checkout__summary') as HTMLElement)

    expect(lines.getByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(lines.getByText('2 × $ 145.000')).toBeInTheDocument()
    expect(lines.getByText('$ 290.000')).toBeInTheDocument()
    expect(summary.getByText('Centro')).toBeInTheDocument()
    expect(summary.getByText('Efectivo')).toBeInTheDocument()
    expect(summary.getByText('Total a cobrar')).toBeInTheDocument()
    expect(summary.getByText('$ 290.000')).toBeInTheDocument()
  })

  it('adds the reference to the payment line', () => {
    renderDialog([{ product: whey, quantity: 2 }], { reference: 'NQ-1', paymentMethod: NEQUI })

    expect(screen.getByText('Nequi · Ref. NQ-1')).toBeInTheDocument()
  })

  it('charges the exact payload of the sale', async () => {
    const { user, onCompleted } = renderDialog()

    await user.click(charge())

    expect(createSale).toHaveBeenCalledWith(
      {
        branchId: 'branch-centro',
        items: [{ productId: 'product-whey', quantity: 2 }],
        payments: [{ paymentMethodId: 'pm-cash', amount: '290000.00', reference: null }],
      },
      'test-token',
    )
    expect(onCompleted).toHaveBeenCalledWith(buildSale())
  })

  it('sends the trimmed reference', async () => {
    const { user } = renderDialog([{ product: whey, quantity: 1 }], { reference: ' NQ-1 ' })

    await user.click(charge('145\\.000'))

    expect(createSale).toHaveBeenCalledWith(
      expect.objectContaining({
        payments: [{ paymentMethodId: 'pm-cash', amount: '145000.00', reference: 'NQ-1' }],
      }),
      'test-token',
    )
  })

  it('shows the progress and confirms the sale', async () => {
    let resolve: (sale: ReturnType<typeof buildSale>) => void = () => {}
    createSale.mockReturnValue(new Promise((done) => (resolve = done)))
    const { user, onCompleted, onCancel } = renderDialog()

    await user.click(charge())

    expect(screen.getByRole('button', { name: 'Registrando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Seguir vendiendo' })).toBeDisabled()

    resolve(buildSale())

    await waitFor(() => expect(onCompleted).toHaveBeenCalledWith(buildSale()))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('lists the products without enough stock and asks for a refresh', async () => {
    createSale.mockRejectedValue(
      new ApiError(
        'Short',
        422,
        { items: [{ productName: 'Whey Protein 2 lb', requested: 1, available: 0 }] },
        'INSUFFICIENT_STOCK',
      ),
    )
    const { user, onCompleted, onStockChanged } = renderDialog()

    await user.click(charge())

    expect(await screen.findByText('Whey Protein 2 lb: pediste 1, quedan 0.')).toBeInTheDocument()
    expect(onStockChanged).toHaveBeenCalled()
    expect(onCompleted).not.toHaveBeenCalled()
    expect(charge()).toBeEnabled()
  })

  it('explains a generic failure without refreshing the stock', async () => {
    createSale.mockRejectedValue(new Error('boom'))
    const { user, onStockChanged } = renderDialog()

    await user.click(charge())

    expect(
      await screen.findByText('No fue posible registrar la venta. Intenta de nuevo.'),
    ).toBeInTheDocument()
    expect(onStockChanged).not.toHaveBeenCalled()
  })

  it('keeps selling when the dialog is cancelled', async () => {
    const { user, onCancel } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Seguir vendiendo' }))

    expect(onCancel).toHaveBeenCalled()
    expect(createSale).not.toHaveBeenCalled()
  })
})
