import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { ConsolidatedItem } from '../../types/inventory'

import { ConsolidatedTable } from './ConsolidatedTable'

const whey: ConsolidatedItem = {
  product: { id: 'product-whey', name: 'Whey Protein 2 lb', referenceCode: 'WHEY-2LB-001' },
  branchesTotal: 32,
  total: 32,
  branches: [
    { branchId: 'branch-centro', branchName: 'Centro', quantity: 12, minimumStock: 5 },
    { branchId: 'branch-norte', branchName: 'Norte', quantity: 20, minimumStock: 25 },
  ],
}

describe('ConsolidatedTable', () => {
  it('shows the total of every branch and how many are under their minimum', () => {
    render(<ConsolidatedTable items={[whey]} />)

    const row = screen.getByText('Whey Protein 2 lb').closest('tr') as HTMLElement
    expect(within(row).getByText('32')).toBeInTheDocument()
    expect(within(row).getByText('1 bajo mínimo')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /Desglose/ })).not.toBeInTheDocument()
  })

  it('expands and collapses the breakdown by branch', async () => {
    const user = userEvent.setup()
    render(<ConsolidatedTable items={[whey]} />)

    const toggle = screen.getByRole('button', {
      name: 'Ver el desglose por sede de Whey Protein 2 lb',
    })
    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const breakdown = screen.getByRole('table', { name: 'Desglose por sede de Whey Protein 2 lb' })
    const rows = within(breakdown).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'Centro125En nivel',
      'Norte2025Bajo mínimo',
    ])

    await user.click(
      screen.getByRole('button', { name: 'Ocultar el desglose por sede de Whey Protein 2 lb' }),
    )
    expect(screen.queryByRole('table', { name: /Desglose/ })).not.toBeInTheDocument()
  })
})
