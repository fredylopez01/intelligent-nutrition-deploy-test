import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RowActions } from './RowActions'

function renderMenu() {
  const onEdit = vi.fn()
  const onDeactivate = vi.fn()
  const user = userEvent.setup()
  render(
    <>
      <RowActions
        label="Acciones para Proteínas"
        actions={[
          { label: 'Editar', onSelect: onEdit },
          { label: 'Desactivar', onSelect: onDeactivate, tone: 'danger' },
        ]}
      />
      <p>Fuera del menú</p>
    </>,
  )
  return { user, onEdit, onDeactivate }
}

function trigger() {
  return screen.getByRole('button', { name: 'Acciones para Proteínas' })
}

describe('RowActions', () => {
  it('opens the menu with every action and focuses the first one', async () => {
    const { user } = renderMenu()

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus()
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toHaveClass(
      'ui-row-actions__item--danger',
    )
  })

  it('runs the chosen action and closes', async () => {
    const { user, onDeactivate, onEdit } = renderMenu()

    await user.click(trigger())
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))

    expect(onDeactivate).toHaveBeenCalledTimes(1)
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves between the actions with the arrows and closes with Escape', async () => {
    const { user, onDeactivate } = renderMenu()

    await user.click(trigger())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Desactivar' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{Enter}')

    expect(onDeactivate).toHaveBeenCalledTimes(1)

    await user.click(trigger())
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger()).toHaveFocus()
  })

  it('closes when clicking outside', async () => {
    const { user } = renderMenu()

    await user.click(trigger())
    await user.click(screen.getByText('Fuera del menú'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
