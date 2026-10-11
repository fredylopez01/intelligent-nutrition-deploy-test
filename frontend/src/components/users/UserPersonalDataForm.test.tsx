import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usersService } from '../../services/users.service'
import type { User } from '../../types/user'

import { UserPersonalDataForm } from './UserPersonalDataForm'

vi.mock('../../services/users.service', () => ({
  usersService: { update: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateUser = vi.mocked(usersService.update)

const yulieth: User = {
  id: 'user-1',
  personId: 'user-1',
  person: {
    id: 'user-1',
    firstName: 'Yulieth',
    lastName: 'Tarazona',
    email: 'yulieth@intelligent.co',
    phone: '3001234567',
    address: 'Calle 10 # 20-30',
  },
  role: { id: 'role-assistant', name: 'BRANCH_ASSISTANT' },
  branches: [],
  active: true,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}

function renderForm() {
  const onSaved = vi.fn()
  const user = userEvent.setup()
  render(<UserPersonalDataForm user={yulieth} onSaved={onSaved} />)
  return { user, onSaved }
}

beforeEach(() => {
  vi.resetAllMocks()
  updateUser.mockResolvedValue(yulieth)
})

describe('UserPersonalDataForm contact data', () => {
  it('does not let phone and address be emptied', async () => {
    const { user } = renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.clear(screen.getByLabelText('Dirección'))
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('rejects a phone with characters other than digits', async () => {
    const { user } = renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '300 123 4567')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('sends a valid new phone', async () => {
    const { user, onSaved } = renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3109998877')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateUser).toHaveBeenCalledWith(
      'user-1',
      { person: { phone: '3109998877' } },
      'test-token',
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})
