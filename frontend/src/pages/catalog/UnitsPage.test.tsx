import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure, UnitsListParams } from '../../types/unit'

import { UnitsPage } from './UnitsPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn(), create: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: auth.role } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const listUnits = vi.mocked(unitsService.list)
const createUnit = vi.mocked(unitsService.create)

const kilogram: UnitOfMeasure = {
  id: 'unit-1',
  name: 'Kilogramo',
  abbreviation: 'kg',
  active: true,
}
const box: UnitOfMeasure = { id: 'unit-2', name: 'Cajas', abbreviation: 'cja', active: false }

function pageOf(data: UnitOfMeasure[]) {
  return { data, meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 } }
}

function lastListParams(): UnitsListParams {
  const call = listUnits.mock.lastCall
  if (!call) throw new Error('The units list was never requested')
  return call[0]
}

function renderPage(path = '/catalogo/unidades') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <UnitsPage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listUnits.mockResolvedValue(pageOf([kilogram, box]))
})

describe('UnitsPage', () => {
  it('lists the name, abbreviation and state of each unit', async () => {
    renderPage()

    const row = (await screen.findByText('Kilogramo')).closest('tr') as HTMLElement
    expect(within(row).getByText('kg')).toBeInTheDocument()
    expect(within(row).getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
    expect(lastListParams()).toEqual({ page: 1, limit: 10, search: undefined, active: undefined })
  })

  it('searches and filters by state', async () => {
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'kilo{Enter}')
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'kilo' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'activas')

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ page: 1, search: 'kilo', active: true }),
    )
  })

  it('clears the filters when nothing matches', async () => {
    listUnits.mockResolvedValue(pageOf([]))
    const { user } = renderPage('/catalogo/unidades?q=zzz')
    expect(await screen.findByText('Ninguna unidad coincide con los filtros')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ search: undefined }))
  })

  it('registers a unit and confirms it', async () => {
    createUnit.mockResolvedValue({ id: 'unit-3', name: 'Gramo', abbreviation: 'g', active: true })
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    await user.click(screen.getByRole('button', { name: 'Registrar unidad' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Nombre'), 'Gramo')
    await user.type(dialog.getByLabelText('Abreviatura'), 'g')
    await user.click(dialog.getByRole('button', { name: 'Registrar unidad' }))

    expect(
      await screen.findByText('La unidad Gramo (g) quedó registrada y activa.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['BRANCH_LEADER', 'BRANCH_ASSISTANT'])(
    'lets the %s consult but not register units',
    async (role) => {
      auth.role = role
      renderPage()
      await screen.findByText('Kilogramo')

      expect(screen.queryByRole('button', { name: 'Registrar unidad' })).not.toBeInTheDocument()
    },
  )

  it('hides the register action in the empty state from who cannot register', async () => {
    auth.role = 'BRANCH_LEADER'
    listUnits.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay unidades de medida')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar unidad' })).not.toBeInTheDocument()
  })
})
