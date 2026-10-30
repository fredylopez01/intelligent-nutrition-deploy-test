import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildSale } from '../../test-utils/sales'

import { SaleDetail } from './SaleDetail'

describe('SaleDetail', () => {
  it('shows the items, the totals and every payment', () => {
    render(
      <SaleDetail
        sale={buildSale({
          customer: { id: 'customer-1', fullName: 'Ana Gómez' },
          discountAmount: '10000.00',
          total: '280000.00',
          payments: [
            {
              paymentMethod: { id: 'pm-cash', code: 'CASH', name: 'Efectivo' },
              amount: '200000.00',
              reference: null,
              paidAt: '2026-10-26T15:03:00.000Z',
            },
            {
              paymentMethod: { id: 'pm-nequi', code: 'NEQUI', name: 'Nequi' },
              amount: '80000.00',
              reference: 'NQ-123',
              paidAt: '2026-10-26T15:03:00.000Z',
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('Cliente: Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.getByText('−$ 10.000')).toBeInTheDocument()
    expect(screen.getByText('Nequi · ref. NQ-123')).toBeInTheDocument()
    expect(screen.getByText('$ 280.000')).toBeInTheDocument()
  })

  it('shows the reason of a reversed sale', () => {
    render(
      <SaleDetail
        sale={buildSale({
          status: 'REVERSED',
          reversalReason: 'El cliente pidió otro sabor',
          reversedAt: '2026-10-26T16:00:00.000Z',
        })}
      />,
    )

    expect(screen.getByText('Reversada')).toBeInTheDocument()
    expect(screen.getByText('El cliente pidió otro sabor')).toBeInTheDocument()
  })

  it('renders the items table with its caption and headers', () => {
    render(<SaleDetail sale={buildSale()} />)

    expect(screen.getByRole('table', { name: 'Productos de la venta' })).toBeInTheDocument()
    for (const header of ['Producto', 'Cant.', 'Precio', 'Total']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
  })

  it('shows each item quantity, unit price and total', () => {
    render(<SaleDetail sale={buildSale()} />)

    const row = screen.getByText('Whey Protein 2 lb').closest('tr') as HTMLElement
    expect(within(row).getByText('WHEY-2LB')).toBeInTheDocument()
    expect(within(row).getByText('2')).toBeInTheDocument()
    expect(within(row).getByText('$ 145.000')).toBeInTheDocument()
    expect(within(row).getByText('$ 290.000')).toBeInTheDocument()
  })

  it('hides the discount and tax rows when there are no adjustments', () => {
    const { container } = render(<SaleDetail sale={buildSale()} />)
    const totals = within(container.querySelector('.sale-detail__totals') as HTMLElement)

    expect(totals.getByText('Subtotal')).toBeInTheDocument()
    expect(totals.getByText('Total')).toBeInTheDocument()
    expect(totals.queryByText('Descuentos')).not.toBeInTheDocument()
    expect(totals.queryByText('Impuestos')).not.toBeInTheDocument()
  })

  it('shows a payment without reference', () => {
    render(<SaleDetail sale={buildSale()} />)

    expect(screen.getByText('Pagos')).toBeInTheDocument()
    expect(screen.getByText('Efectivo')).toBeInTheDocument()
    expect(screen.queryByText(/· ref\./)).not.toBeInTheDocument()
  })

  it('falls back when the sale has no customer', () => {
    render(<SaleDetail sale={buildSale()} />)

    expect(screen.getByText('Cliente: venta sin cliente identificado')).toBeInTheDocument()
  })

  it('shows when the sale was reversed', () => {
    render(
      <SaleDetail
        sale={buildSale({
          status: 'REVERSED',
          reversalReason: 'Error de cobro',
          reversedAt: '2026-10-26T16:00:00.000Z',
        })}
      />,
    )

    expect(screen.getByText(/^Reversada el /)).toBeInTheDocument()
    expect(screen.getByText('Error de cobro')).toBeInTheDocument()
  })
})
