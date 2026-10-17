import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { buildInventoryItem, withoutThresholds } from '../../test-utils/inventory'

import { InventoryTable } from './InventoryTable'

const whey = buildInventoryItem()
const creatine = buildInventoryItem({
  product: {
    ...whey.product,
    id: 'product-creatine',
    name: 'Creatina 300 g',
    referenceCode: 'CREA-300G',
  },
  totalQuantity: 4,
  minimumStock: 10,
  lowStock: true,
})
const bars = buildInventoryItem({
  product: { ...whey.product, id: 'product-bars', name: 'Barras', referenceCode: 'BAR-01' },
  totalQuantity: 0,
  minimumStock: 0,
  lowStock: false,
})

function rowOf(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement
}

describe('InventoryTable', () => {
  it('shows one row per product with its total stock, minimum and status', () => {
    render(<InventoryTable items={[whey, creatine, bars]} showThresholds onViewLots={vi.fn()} />)

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual([
      'Producto',
      'Categoría',
      'Existencias',
      'Stock mínimo',
      'Estado',
      'Acciones',
    ])
    expect(within(rowOf('Whey Protein 2 lb')).getByText('35')).toBeInTheDocument()
    expect(within(rowOf('Whey Protein 2 lb')).getByText('En nivel')).toBeInTheDocument()
    expect(within(rowOf('Creatina 300 g')).getByText('Bajo mínimo')).toBeInTheDocument()
    expect(within(rowOf('Barras')).getByText('Agotado')).toBeInTheDocument()
  })

  it('highlights the products under their minimum or out of stock', () => {
    render(<InventoryTable items={[whey, creatine, bars]} showThresholds onViewLots={vi.fn()} />)

    expect(rowOf('Whey Protein 2 lb')).not.toHaveClass('inventory-table__row--low')
    expect(rowOf('Creatina 300 g')).toHaveClass('inventory-table__row--low')
    expect(rowOf('Barras')).toHaveClass('inventory-table__row--low')
  })

  it('hides the minimum stock from the branch assistant', () => {
    render(
      <InventoryTable
        items={[withoutThresholds(whey)]}
        showThresholds={false}
        onViewLots={vi.fn()}
      />,
    )

    expect(screen.queryByRole('columnheader', { name: 'Stock mínimo' })).not.toBeInTheDocument()
    expect(screen.getByText('Disponible')).toBeInTheDocument()
  })

  it('opens the lots from the row menu', async () => {
    const user = userEvent.setup()
    const onViewLots = vi.fn()
    render(<InventoryTable items={[whey]} showThresholds onViewLots={onViewLots} />)

    await user.click(screen.getByRole('button', { name: 'Acciones para Whey Protein 2 lb' }))
    await user.click(screen.getByRole('menuitem', { name: 'Ver lotes' }))

    expect(onViewLots).toHaveBeenCalledWith(whey)
  })
})
