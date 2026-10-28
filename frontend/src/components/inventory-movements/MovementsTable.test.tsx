import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CENTRO, NORTE, buildMovement } from '../../test-utils/inventoryMovements'

import { MovementsTable } from './MovementsTable'

function renderTable(movements = [buildMovement()], viewedBranchId?: string) {
  const onViewDetail = vi.fn()
  const user = userEvent.setup()
  render(
    <MovementsTable
      movements={movements}
      viewedBranchId={viewedBranchId}
      onViewDetail={onViewDetail}
    />,
  )
  return { user, onViewDetail }
}

describe('MovementsTable', () => {
  it('renders the column headers and the accessible caption', () => {
    renderTable()

    expect(
      screen.getByRole('table', {
        name: 'Movimientos de inventario, del más reciente al más antiguo',
      }),
    ).toBeInTheDocument()
    for (const header of ['Movimiento', 'Producto', 'Lote', 'Cantidad', 'Sede', 'Registró']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
  })

  it('renders one row per movement with its product, lot and user', () => {
    const movement = buildMovement()
    renderTable([movement])

    const row = screen.getByText('Salida').closest('tr') as HTMLElement
    expect(within(row).getAllByText('Whey Protein 2 lb')).not.toHaveLength(0)
    expect(within(row).getByText('WHEY-2LB')).toBeInTheDocument()
    expect(within(row).getByText('31 ene 2027')).toBeInTheDocument()
    expect(within(row).getByText('Laura Pérez')).toBeInTheDocument()
  })

  it('shows a dash when the movement has no lot', () => {
    renderTable([buildMovement({ expirationDate: null })])

    const row = screen.getByText('Salida').closest('tr') as HTMLElement
    expect(within(row).getByText('—')).toBeInTheDocument()
  })

  it('signs the quantity according to the viewed branch for a transfer', () => {
    const transfer = buildMovement({
      movementType: 'TRANSFER',
      quantity: 4,
      originBranch: { id: CENTRO.id, name: CENTRO.name },
      branch: { id: NORTE.id, name: NORTE.name },
    })

    const { unmount } = render(
      <MovementsTable movements={[transfer]} viewedBranchId={CENTRO.id} onViewDetail={vi.fn()} />,
    )
    expect(screen.getByText('−4 und')).toBeInTheDocument()
    expect(screen.getByText('Centro → Norte')).toBeInTheDocument()
    unmount()

    render(
      <MovementsTable movements={[transfer]} viewedBranchId={NORTE.id} onViewDetail={vi.fn()} />,
    )
    expect(screen.getByText('+4 und')).toBeInTheDocument()
  })

  it('shows the transfer route in the place column', () => {
    renderTable([
      buildMovement({
        movementType: 'TRANSFER',
        originBranch: { id: CENTRO.id, name: CENTRO.name },
        branch: { id: NORTE.id, name: NORTE.name },
      }),
    ])

    expect(screen.getByText('Centro → Norte')).toBeInTheDocument()
  })

  it('calls onViewDetail with the movement when its detail button is clicked', async () => {
    const movement = buildMovement()
    const { user, onViewDetail } = renderTable([movement])

    await user.click(screen.getByRole('button', { name: /Ver detalle del movimiento/ }))

    expect(onViewDetail).toHaveBeenCalledWith(movement)
  })
})
