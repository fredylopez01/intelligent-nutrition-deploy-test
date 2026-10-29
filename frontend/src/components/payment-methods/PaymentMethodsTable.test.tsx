import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { CASH, NEQUI, OTHER } from '../../test-utils/paymentMethods'
import type { PaymentMethod } from '../../types/paymentMethod'

import { PaymentMethodsTable } from './PaymentMethodsTable'

interface RenderTableOptions {
  rows?: PaymentMethod[]
  canManage?: boolean
}

function renderTable({ rows = [CASH, NEQUI, OTHER], canManage = true }: RenderTableOptions = {}) {
  const onEdit = vi.fn()
  const onToggleStatus = vi.fn()
  render(
    <PaymentMethodsTable
      paymentMethods={rows}
      canManage={canManage}
      onEdit={onEdit}
      onToggleStatus={onToggleStatus}
    />,
  )
  return { onEdit, onToggleStatus }
}

function rowOf(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement
}

async function openRowMenu(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: `Acciones para ${name}` }))
  return { user, menu: await screen.findByRole('menu') }
}

describe('PaymentMethodsTable', () => {
  it('shows the column headers for a manager', () => {
    renderTable()

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Código', 'Nombre', 'Estado', 'Acciones'])
  })

  it('hides the actions column when the user cannot manage payment methods', () => {
    renderTable({ canManage: false })

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Código', 'Nombre', 'Estado'])
    expect(screen.queryByRole('button', { name: /Acciones para/ })).not.toBeInTheDocument()
  })

  it('shows the code, name and state of each payment method', () => {
    renderTable()

    const cash = within(rowOf('Efectivo'))
    expect(cash.getAllByText('CASH')).toHaveLength(2)
    expect(cash.getByText('Activo')).toHaveClass('ui-status--activo')

    const other = within(rowOf('Otro'))
    expect(other.getAllByText('OTHER')).toHaveLength(2)
    expect(other.getByText('Inactivo')).toHaveClass('ui-status--inactivo')
  })

  it('describes the table for screen readers', () => {
    renderTable()

    expect(
      screen.getByRole('table', { name: 'Métodos de pago disponibles en el punto de venta' }),
    ).toBeInTheDocument()
  })

  it('offers to edit the name and deactivate an active method', async () => {
    renderTable()

    const { menu } = await openRowMenu('Efectivo')

    expect(within(menu).getByRole('menuitem', { name: 'Editar nombre' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Desactivar' })).toHaveClass(
      'ui-row-actions__item--danger',
    )
  })

  it('offers to activate an inactive method', async () => {
    renderTable()

    const { menu } = await openRowMenu('Otro')

    expect(within(menu).getByRole('menuitem', { name: 'Activar' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('notifies the edited method and closes the menu', async () => {
    const { onEdit } = renderTable()

    const { user, menu } = await openRowMenu('Efectivo')
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar nombre' }))

    expect(onEdit).toHaveBeenCalledWith(CASH)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('notifies the status change with the selected method', async () => {
    const { onToggleStatus } = renderTable()

    const { user, menu } = await openRowMenu('Nequi')
    await user.click(within(menu).getByRole('menuitem', { name: 'Desactivar' }))

    expect(onToggleStatus).toHaveBeenCalledWith(NEQUI)
    expect(onToggleStatus).toHaveBeenCalledTimes(1)
  })
})
