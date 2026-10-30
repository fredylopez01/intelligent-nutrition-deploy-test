import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserMenu } from './UserMenu'

const logout = vi.fn()

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    logout,
    user: {
      id: 'me',
      fullName: 'Laura Pérez',
      email: 'laura@intelligent.test',
      role: { name: 'SUPERADMIN' },
    },
  }),
}))

function renderMenu() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<UserMenu />} />
        <Route path="/login" element={<p>Pantalla de ingreso</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  logout.mockReset()
})

describe('UserMenu', () => {
  it('shows only the avatar until it is opened', () => {
    renderMenu()

    expect(screen.getByRole('button', { name: 'Menú de usuario de Laura Pérez' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByText('laura@intelligent.test')).not.toBeInTheDocument()
  })

  it('opens the profile, settings and logout options', async () => {
    const { user } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Menú de usuario de Laura Pérez' }))

    expect(screen.getByText('laura@intelligent.test')).toBeInTheDocument()
    expect(screen.getByText('Superadmin')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil')
    expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute(
      'href',
      '/configuracion',
    )
  })

  it('logs out and goes to the login screen', async () => {
    const { user } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Menú de usuario de Laura Pérez' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(logout).toHaveBeenCalled()
    expect(screen.getByText('Pantalla de ingreso')).toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    const { user } = renderMenu()

    await user.click(screen.getByRole('button', { name: 'Menú de usuario de Laura Pérez' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })
})
