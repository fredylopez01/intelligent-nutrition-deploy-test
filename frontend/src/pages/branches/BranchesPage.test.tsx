import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import type { Branch, BranchesListParams, BranchesListResponse } from '../../types/branch'

import { BranchesPage } from './BranchesPage'

vi.mock('../../services/branches.service', () => ({
  branchesService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
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

const listBranches = vi.mocked(branchesService.list)

const makro: Branch = {
  id: 'branch-1',
  name: 'Sede Makro',
  address: 'Av. Universitaria 20-30, Tunja',
  phone: '3007000001',
  active: true,
}

function pageOf(data: Branch[], extra: Partial<BranchesListResponse> = {}): BranchesListResponse {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 },
    ...extra,
  }
}

function lastListParams(): BranchesListParams {
  const call = listBranches.mock.lastCall
  if (!call) throw new Error('The branches list was never requested')
  return call[0]
}

function renderPage() {
  const user = userEvent.setup()
  render(<BranchesPage />)
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('BranchesPage filters', () => {
  beforeEach(() => {
    listBranches.mockResolvedValue(pageOf([makro]))
  })

  it('loads the first page without filters', async () => {
    renderPage()

    expect(await screen.findByRole('cell', { name: 'Sede Makro' })).toBeInTheDocument()
    expect(listBranches).toHaveBeenCalledWith(
      { page: 1, limit: 10, search: undefined, active: undefined },
      'test-token',
    )
  })

  it('applies the name filter with the trimmed text', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), '  Makro ')

    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'Makro', page: 1 }))
  })

  it('ignores a search made only of spaces', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), '   ')

    expect(lastListParams().search).toBeUndefined()
  })

  it.each([
    ['Activas', true],
    ['Inactivas', false],
  ])('applies the "%s" status filter', async (label, active) => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por estado' }), label)

    await waitFor(() => expect(lastListParams()).toMatchObject({ active, page: 1 }))
  })

  it('removes the status filter when going back to every status', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })
    const statusFilter = screen.getByRole('combobox', { name: 'Filtrar por estado' })

    await user.selectOptions(statusFilter, 'Inactivas')
    await user.selectOptions(statusFilter, 'Todos los estados')

    await waitFor(() => expect(lastListParams().active).toBeUndefined())
  })

  it('combines the name and status filters in the same request', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'Sede')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Activas',
    )

    await waitFor(() =>
      expect(lastListParams()).toEqual({ page: 1, limit: 10, search: 'Sede', active: true }),
    )
  })

  it('goes back to the first page when a filter changes', async () => {
    listBranches.mockResolvedValue({
      data: [makro],
      meta: { page: 1, limit: 10, total: 15, totalPages: 2 },
    })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(lastListParams().page).toBe(2))

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Activas',
    )

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, active: true }))
  })
})

describe('BranchesPage empty list', () => {
  it('invites to register the first branch when there are no branches', async () => {
    listBranches.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay sedes registradas')).toBeInTheDocument()
    expect(screen.getByText('Registra la primera sede para empezar a operar.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar sede' })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the message sent by the api for an empty list', async () => {
    listBranches.mockResolvedValue(pageOf([], { message: 'No hay sedes registradas.' }))
    renderPage()

    expect(await screen.findByText('No hay sedes registradas.')).toBeInTheDocument()
  })

  it('explains that no branch matches when a filter is applied', async () => {
    listBranches.mockResolvedValueOnce(pageOf([makro])).mockResolvedValue(pageOf([]))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Sede Makro' })

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Inactivas',
    )

    expect(await screen.findByText('Ninguna sede coincide con la búsqueda')).toBeInTheDocument()
    expect(screen.getByText('Revisa el nombre o cambia el filtro de estado.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar sede' })).toHaveLength(1)
  })
})
