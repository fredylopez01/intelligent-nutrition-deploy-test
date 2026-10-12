import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { rolesService } from '../../services/roles.service'
import { usersService } from '../../services/users.service'
import type { User, UsersListParams } from '../../types/user'

import { UsersPage } from './UsersPage'

vi.mock('../../services/users.service', () => ({
  usersService: { list: vi.fn() },
}))

vi.mock('../../services/roles.service', () => ({
  rolesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const listUsers = vi.mocked(usersService.list)

function buildUser(id: string, firstName: string, email: string): User {
  return {
    id,
    personId: id,
    person: { id, firstName, lastName: 'Prueba', email, phone: '3001112233', address: 'Calle 1' },
    role: { id: 'role-assistant', name: 'BRANCH_ASSISTANT' },
    branches: [],
    active: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  }
}

const laura = buildUser('user-1', 'Laura', 'laura@intelligent.co')

function pageOf(users: User[], totalPages = users.length > 0 ? 1 : 0) {
  return { data: users, meta: { page: 1, limit: 10, total: users.length, totalPages } }
}

function lastListParams(): UsersListParams {
  const call = listUsers.mock.lastCall
  if (!call) throw new Error('The users list was never requested')
  return call[0]
}

function renderPage(path = '/usuarios') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <UsersPage />
    </MemoryRouter>,
  )
  return { user }
}

function searchBox() {
  return screen.getByRole('searchbox', { name: 'Buscar por nombre o correo' })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rolesService.list).mockResolvedValue([
    { id: 'role-assistant', name: 'BRANCH_ASSISTANT', active: true },
  ])
  listUsers.mockResolvedValue(pageOf([laura]))
})

describe('UsersPage search bar', () => {
  it('does not query while typing and searches when confirmed', async () => {
    const { user } = renderPage()
    await screen.findByText('Laura Prueba')
    const requests = listUsers.mock.calls.length

    await user.type(searchBox(), '  laura ')
    expect(listUsers).toHaveBeenCalledTimes(requests)

    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, search: 'laura' }))
  })

  it('asks for two characters before searching', async () => {
    const { user } = renderPage()
    await screen.findByText('Laura Prueba')
    const requests = listUsers.mock.calls.length

    await user.type(searchBox(), 'l{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe al menos 2 caracteres para buscar.',
    )
    expect(listUsers).toHaveBeenCalledTimes(requests)
  })

  it('reloads the current query when the same search is confirmed again', async () => {
    const { user } = renderPage('/usuarios?q=laura')
    await screen.findByText('Laura Prueba')
    const requests = listUsers.mock.calls.length

    await user.type(searchBox(), '{Enter}')

    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ search: 'laura' })
  })
})

describe('UsersPage reload', () => {
  it('reloads the list with the same filters', async () => {
    const { user } = renderPage('/usuarios?estado=activos&q=laura')
    await screen.findByText('Laura Prueba')
    const requests = listUsers.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ page: 1, active: true, search: 'laura' })
  })

  it('disables the reload button while the list loads', () => {
    listUsers.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('button', { name: 'Cargando...' })).toBeDisabled()
  })
})

describe('UsersPage empty states', () => {
  it('invites to register the first user when there are none', async () => {
    listUsers.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay usuarios registrados')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar usuario' })).toHaveLength(2)
  })

  it('clears the search and every filter from the empty state', async () => {
    listUsers.mockResolvedValue(pageOf([]))
    const { user } = renderPage('/usuarios?q=zzz&estado=inactivos&rol=role-assistant')

    expect(await screen.findByText('Ningún usuario coincide con los filtros')).toBeInTheDocument()
    expect(searchBox()).toHaveValue('zzz')
    listUsers.mockResolvedValue(pageOf([laura]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Laura Prueba')).toBeInTheDocument()
    expect(lastListParams()).toMatchObject({
      page: 1,
      search: undefined,
      active: undefined,
      roleId: undefined,
    })
    expect(searchBox()).toHaveValue('')
  })
})

describe('UsersPage pagination', () => {
  it('moves to the next page keeping the filters', async () => {
    listUsers.mockResolvedValue(pageOf([laura], 3))
    const { user } = renderPage('/usuarios?estado=activos')
    await screen.findByText('Laura Prueba')

    const pagination = screen.getByRole('navigation', { name: 'Paginación de usuarios' })
    await user.click(within(pagination).getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2, active: true }))
  })
})
