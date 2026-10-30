import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { buildSummary } from '../../test-utils/inventoryClosures'

import { ClosuresTable } from './ClosuresTable'

const blocked = buildSummary({
  id: 'closure-yesterday',
  closureDate: '2026-10-25',
  status: 'NOT_CONFIRMED',
  confirmed: false,
  locked: true,
  closedAt: '2026-10-26T05:00:00.000Z',
  countedItems: 0,
  totalItems: 2,
  totalDifferences: null,
  userName: null,
})

function renderTable(overrides: Partial<Parameters<typeof ClosuresTable>[0]> = {}) {
  const onView = vi.fn()
  const user = userEvent.setup()
  render(
    <ClosuresTable
      closures={[blocked]}
      showBranch
      showDifferences
      onView={onView}
      {...overrides}
    />,
  )
  return { user, onView }
}

describe('ClosuresTable', () => {
  it('marks the blocked closure of the previous day', () => {
    renderTable()

    const row = screen.getByText('25 oct 2026').closest('tr') as HTMLElement
    expect(within(row).getByText('Sin confirmar')).toBeInTheDocument()
    expect(within(row).getByText('Centro')).toBeInTheDocument()
    expect(within(row).getByText('0 de 2 lotes')).toBeInTheDocument()
    expect(within(row).getAllByText('—')).toHaveLength(2)
  })

  it('opens the closure report from the row', async () => {
    const { user, onView } = renderTable()

    await user.click(
      screen.getByRole('button', { name: 'Ver el cierre del 25 oct 2026 de Centro' }),
    )

    expect(onView).toHaveBeenCalledWith(blocked)
  })

  it('hides the branch and differences columns when not allowed', () => {
    renderTable({ showBranch: false, showDifferences: false })

    expect(screen.queryByRole('columnheader', { name: 'Sede' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Diferencias' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Conteo' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Inició' })).toBeInTheDocument()
  })
})
