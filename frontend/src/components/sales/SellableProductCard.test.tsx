import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { buildSellable } from '../../test-utils/sales'
import type { SellableProduct } from '../../types/sale'

import { SellableProductCard } from './SellableProductCard'

function renderCard(
  overrides: Partial<SellableProduct> = {},
  props: { inSelection?: number; canSelect?: boolean } = {},
) {
  const onAdd = vi.fn()
  const user = userEvent.setup()
  const product = buildSellable(overrides)
  const { container } = render(
    <ul>
      <SellableProductCard
        product={product}
        inSelection={props.inSelection ?? 0}
        canSelect={props.canSelect ?? true}
        onAdd={onAdd}
      />
    </ul>,
  )
  return { user, onAdd, product, container }
}

describe('SellableProductCard', () => {
  it('renders name, reference, price and available stock', () => {
    renderCard()

    expect(screen.getByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.getByText('WHEY-2LB')).toBeInTheDocument()
    expect(screen.getByText('$ 145.000')).toBeInTheDocument()
    expect(screen.getByText('3 und disponibles')).toBeInTheDocument()
  })

  it('uses the piece unit when the product has no unit', () => {
    renderCard({ unit: undefined, availableQuantity: 2 })

    expect(screen.getByText('2 und disponibles')).toBeInTheDocument()
  })

  it('renders the image when the product has one', () => {
    const { container } = renderCard({ primaryImageUrl: 'https://cdn.example.com/whey.webp' })

    const image = container.querySelector('img')
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/whey.webp')
    expect(image).toHaveAttribute('alt', '')
    expect(screen.queryByText('Sin imagen')).not.toBeInTheDocument()
  })

  it('shows the placeholder when the product has no image', () => {
    const { container } = renderCard()

    expect(screen.getByText('Sin imagen')).toBeInTheDocument()
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('marks stock as low at three units or fewer', () => {
    renderCard({ availableQuantity: 3 })

    expect(screen.getByText('3 und disponibles')).toHaveClass('pos-card__stock--low')
  })

  it('does not mark stock as low above three units', () => {
    renderCard({ availableQuantity: 4 })

    expect(screen.getByText('4 und disponibles')).not.toHaveClass('pos-card__stock--low')
  })

  it('shows the selection badge with an accessible label', () => {
    renderCard({}, { inSelection: 2 })

    expect(screen.getByLabelText('2 en la venta')).toHaveTextContent('2')
  })

  it('hides the badge when the product is not in the sale', () => {
    renderCard()

    expect(screen.queryByLabelText(/en la venta/)).not.toBeInTheDocument()
  })

  it('adds the product from the button', async () => {
    const { user, onAdd, product } = renderCard()

    await user.click(screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }))

    expect(onAdd).toHaveBeenCalledWith(product)
  })

  it('keeps the product addable while units remain', () => {
    renderCard({}, { inSelection: 2 })

    expect(
      screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }),
    ).toBeEnabled()
  })

  it('disables the button when the selection already uses all units', () => {
    renderCard({}, { inSelection: 3 })

    const button = screen.getByRole('button', {
      name: 'Whey Protein 2 lb: ya agregaste todas las unidades disponibles',
    })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Sin más unidades')
  })

  it('hides the add action in read only mode', () => {
    renderCard({}, { canSelect: false })

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
