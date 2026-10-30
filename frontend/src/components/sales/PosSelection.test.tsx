import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CASH } from '../../test-utils/paymentMethods'
import { buildSellable } from '../../test-utils/sales'

import { PosSelection, type SelectionLine } from './PosSelection'

const whey = buildSellable()
const creatine = buildSellable({
  productId: 'product-creatine',
  name: 'Creatina 300 g',
  referenceCode: 'CREA-300',
  price: '99900.00',
  availableQuantity: 1,
})

function renderSelection(lines: SelectionLine[] = []) {
  const onChangeQuantity = vi.fn()
  const onRemove = vi.fn()
  const onClear = vi.fn()
  const user = userEvent.setup()
  const { container } = render(
    <PosSelection
      lines={lines}
      onChangeQuantity={onChangeQuantity}
      onRemove={onRemove}
      onClear={onClear}
      paymentMethods={[CASH]}
      paymentStatus="success"
      paymentMethodId={CASH.id}
      onPaymentMethodChange={vi.fn()}
      reference=""
      onReferenceChange={vi.fn()}
      onRetryPaymentMethods={vi.fn()}
      onCheckout={vi.fn()}
    />,
  )
  return { user, onChangeQuantity, onRemove, onClear, container }
}

describe('PosSelection', () => {
  it('explains the empty sale and hides the clear action', () => {
    renderSelection()

    expect(screen.getByText(/Agrega productos desde el panel/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Vaciar' })).not.toBeInTheDocument()
  })

  it('lists each line with its unit price and line total', () => {
    renderSelection([{ product: whey, quantity: 2 }])

    expect(screen.getByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.getByText('$ 145.000 c/u · $ 290.000')).toBeInTheDocument()
  })

  it('adds up the units and the total', () => {
    const { container } = renderSelection([
      { product: whey, quantity: 2 },
      { product: creatine, quantity: 1 },
    ])
    const totals = within(container.querySelector('.pos-selection__totals') as HTMLElement)

    expect(totals.getByText('Unidades')).toBeInTheDocument()
    expect(totals.getByText('3')).toBeInTheDocument()
    expect(totals.getByText('Total')).toBeInTheDocument()
    expect(totals.getByText('$ 389.900')).toBeInTheDocument()
  })

  it('increments a line', async () => {
    const { user, onChangeQuantity } = renderSelection([{ product: whey, quantity: 1 }])

    await user.click(
      screen.getByRole('button', { name: 'Agregar una unidad de Whey Protein 2 lb' }),
    )

    expect(onChangeQuantity).toHaveBeenCalledWith('product-whey', 2)
  })

  it('disables the increment at the available stock', () => {
    renderSelection([{ product: whey, quantity: 3 }])

    expect(
      screen.getByRole('button', { name: 'Agregar una unidad de Whey Protein 2 lb' }),
    ).toBeDisabled()
  })

  it('decrements a line above one unit', async () => {
    const { user, onChangeQuantity, onRemove } = renderSelection([{ product: whey, quantity: 2 }])

    await user.click(screen.getByRole('button', { name: 'Quitar una unidad de Whey Protein 2 lb' }))

    expect(onChangeQuantity).toHaveBeenCalledWith('product-whey', 1)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it('removes the line when decrementing from one unit', async () => {
    const { user, onChangeQuantity, onRemove } = renderSelection([{ product: whey, quantity: 1 }])

    await user.click(screen.getByRole('button', { name: 'Quitar una unidad de Whey Protein 2 lb' }))

    expect(onRemove).toHaveBeenCalledWith('product-whey')
    expect(onChangeQuantity).not.toHaveBeenCalled()
  })

  it('removes a line from its close button', async () => {
    const { user, onRemove } = renderSelection([{ product: whey, quantity: 2 }])

    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb de la venta' }))

    expect(onRemove).toHaveBeenCalledWith('product-whey')
  })

  it('clears the whole sale', async () => {
    const { user, onClear } = renderSelection([{ product: whey, quantity: 1 }])

    await user.click(screen.getByRole('button', { name: 'Vaciar' }))

    expect(onClear).toHaveBeenCalled()
  })

  it('reminds that the system confirms the total when the sale is registered', () => {
    renderSelection([{ product: whey, quantity: 1 }])

    expect(
      screen.getByText(/El sistema confirma el total y descuenta el stock/),
    ).toBeInTheDocument()
  })
})
