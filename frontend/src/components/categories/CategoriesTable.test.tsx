import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Category } from '../../types/category'

import { CategoriesTable } from './CategoriesTable'

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

const snacks: Category = {
  id: 'cat-2',
  name: 'Snacks',
  description: null,
  active: false,
}

function renderTable(props: Partial<Parameters<typeof CategoriesTable>[0]> = {}) {
  const onEdit = vi.fn()
  const onToggleStatus = vi.fn()
  const user = userEvent.setup()
  render(
    <CategoriesTable
      categories={[proteins, snacks]}
      canEdit={false}
      canChangeStatus={false}
      onEdit={onEdit}
      onToggleStatus={onToggleStatus}
      {...props}
    />,
  )
  return { user, onEdit, onToggleStatus }
}

describe('CategoriesTable', () => {
  it('lists the name, description and state of each category', () => {
    renderTable()

    const rows = screen.getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Proteínas')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Suplementos de proteína')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Activa')).toBeInTheDocument()
    expect(within(rows[1]).getByText('—')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Inactiva')).toBeInTheDocument()
  })

  it('shows no actions to whoever can only consult', () => {
    renderTable()

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('only offers to edit to a manager who cannot change the state', async () => {
    const { user, onEdit } = renderTable({ canEdit: true })

    await user.click(screen.getByRole('button', { name: 'Acciones para Snacks' }))
    const menu = screen.getByRole('menu', { name: 'Acciones para Snacks' })
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Editar'])
    await user.click(within(menu).getByRole('menuitem', { name: 'Editar' }))

    expect(onEdit).toHaveBeenCalledWith(snacks)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('offers to edit and to change the state to the superadmin', async () => {
    const { user, onToggleStatus } = renderTable({ canEdit: true, canChangeStatus: true })

    await user.click(screen.getByRole('button', { name: 'Acciones para Proteínas' }))
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Acciones para Snacks' }))
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))

    expect(onToggleStatus).toHaveBeenCalledWith(snacks)
  })

  it('always shows the state as a label', () => {
    renderTable({ canEdit: true, canChangeStatus: true })

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
  })
})
