import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { User } from '../../types/user'

import { AuditLogsFilters } from './AuditLogsFilters'

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    personId: 'person-1',
    person: {
      id: 'person-1',
      firstName: 'María',
      lastName: 'Pérez',
      email: 'maria@intelligent.co',
      phone: '3001112233',
      address: 'Calle 1 # 2-3',
    },
    role: { id: 'role-1', name: 'BRANCH_ASSISTANT' },
    branches: [],
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  }
}

function renderFilters(overrides: Partial<Parameters<typeof AuditLogsFilters>[0]> = {}) {
  const handlers = {
    onUserIdChange: vi.fn(),
    onEntityChange: vi.fn(),
    onActionChange: vi.fn(),
    onFromDateChange: vi.fn(),
    onToDateChange: vi.fn(),
  }
  const user = userEvent.setup()
  render(
    <AuditLogsFilters
      showEntity
      users={[buildUser()]}
      userId=""
      entity=""
      action=""
      fromDate=""
      toDate=""
      {...handlers}
      {...overrides}
    />,
  )
  return { user, handlers }
}

describe('AuditLogsFilters', () => {
  it('builds the user options with the full name', async () => {
    const { user, handlers } = renderFilters()
    const select = screen.getByRole('combobox', { name: 'Ejecutado por' })

    expect(
      Array.from(select.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Todos los usuarios', 'María Pérez'])

    await user.selectOptions(select, 'user-1')

    expect(handlers.onUserIdChange).toHaveBeenCalledWith('user-1')
  })

  it('falls back to the email or a placeholder', () => {
    renderFilters({
      users: [
        buildUser({
          id: 'user-2',
          person: { ...buildUser().person, firstName: '', lastName: '' },
        }),
        buildUser({
          id: 'user-3',
          person: { ...buildUser().person, firstName: '', lastName: '', email: '' },
        }),
      ],
    })

    const select = screen.getByRole('combobox', { name: 'Ejecutado por' })
    expect(
      Array.from(select.querySelectorAll('option')).map((option) => option.textContent),
    ).toEqual(['Todos los usuarios', 'maria@intelligent.co', 'Usuario sin nombre'])
  })

  it('applies the action filter', async () => {
    const { user, handlers } = renderFilters()
    const select = screen.getByRole('combobox', { name: 'Acción' })

    expect(select.querySelector('option')?.textContent).toBe('Todas las acciones')
    expect(screen.getByRole('option', { name: 'Eliminación' })).toBeInTheDocument()

    await user.selectOptions(select, 'DELETE')

    expect(handlers.onActionChange).toHaveBeenCalledWith('DELETE')
  })

  it('hides the entity filter without permission and ties the dates', () => {
    renderFilters({
      showEntity: false,
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    })

    expect(screen.queryByRole('combobox', { name: 'Entidad' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Desde')).toHaveAttribute('max', '2026-09-30')
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('min', '2026-09-01')
  })
})
