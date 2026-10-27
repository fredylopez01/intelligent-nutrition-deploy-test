import { render, screen } from '@testing-library/react'
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
})
