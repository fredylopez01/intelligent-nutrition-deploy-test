import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { buildSaleSummary } from '../../test-utils/sales'
import type { SaleSummary } from '../../types/sale'

import { SalesTable } from './SalesTable'

const completed = buildSaleSummary()
const reversed = buildSaleSummary({
  id: 'sale-2',
  saleNumber: 'V-20261026-0002',
  status: 'REVERSED',
  customer: { id: 'customer-1', fullName: 'Ana Gómez' },
  itemsCount: 3,
})

function renderTable(sales: SaleSummary[] = [completed], showBranch = false) {
  const onView = vi.fn()
  const user = userEvent.setup()
  render(<SalesTable sales={sales} showBranch={showBranch} onView={onView} />)
  return { user, onView }
}

describe('SalesTable', () => {
  it('renders the accessible caption and the column headers', () => {
    renderTable()

    expect(
      screen.getByRole('table', {
        name: 'Ventas registradas, de la más reciente a la más antigua',
      }),
    ).toBeInTheDocument()
    for (const header of ['Venta', 'Cliente', 'Vendedor', 'Total', 'Estado', 'Detalle']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
  })

  it('hides the branch column when a single branch is shown', () => {
    renderTable()

    expect(screen.queryByRole('columnheader', { name: 'Sede' })).not.toBeInTheDocument()
  })

  it('shows the branch column when the list mixes branches', () => {
    renderTable([completed], true)

    expect(screen.getByRole('columnheader', { name: 'Sede' })).toBeInTheDocument()
    const row = screen.getByText('V-20261026-0001').closest('tr') as HTMLElement
    expect(within(row).getByText('Centro')).toBeInTheDocument()
  })

  it('renders the number, date, seller and total of each sale', () => {
    renderTable()

    const row = screen.getByText('V-20261026-0001').closest('tr') as HTMLElement
    expect(within(row).getByText(/· 1 producto/)).toBeInTheDocument()
    expect(within(row).getByText('Laura Pérez')).toBeInTheDocument()
    expect(within(row).getByText('$ 290.000')).toBeInTheDocument()
  })

  it('counts the products of each sale', () => {
    renderTable([reversed])

    const row = screen.getByText('V-20261026-0002').closest('tr') as HTMLElement
    expect(within(row).getByText(/· 3 productos/)).toBeInTheDocument()
  })

  it('falls back when the sale has no customer', () => {
    renderTable()

    expect(screen.getByText('Sin cliente')).toBeInTheDocument()
  })

  it('marks a reversed sale', () => {
    renderTable([reversed])

    const row = screen.getByText('V-20261026-0002').closest('tr') as HTMLElement
    expect(within(row).getByText('Reversada')).toBeInTheDocument()
    expect(within(row).getByText('$ 290.000')).toHaveClass('sales-table__number--void')
  })

  it('offers a detail action per row', () => {
    renderTable()

    const button = screen.getByRole('button', { name: 'Ver la venta V-20261026-0001' })
    expect(button).toHaveTextContent('Ver')
  })

  it('reports the sale that was opened', async () => {
    const { user, onView } = renderTable([completed, reversed])

    await user.click(screen.getByRole('button', { name: 'Ver la venta V-20261026-0002' }))

    expect(onView).toHaveBeenCalledWith(reversed)
  })

  it('renders one row per sale', () => {
    renderTable([completed, reversed])

    expect(screen.getAllByRole('button', { name: /^Ver la venta/ })).toHaveLength(2)
  })
})
