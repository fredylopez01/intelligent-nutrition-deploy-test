import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure, UnitsListParams } from '../../types/unit'

import { UnitsPage } from './UnitsPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() },
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
const updateUnit = vi.mocked(unitsService.update)
const updateStatus = vi.mocked(unitsService.updateStatus)

const kilogram: UnitOfMeasure = {
  id: 'unit-1',
  name: 'Kilogramo',
  abbreviation: 'kg',
  active: true,
}
const box: UnitOfMeasure = { id: 'unit-2', name: 'Cajas', abbreviation: 'cja', active: false }

function pageOf(
  data: UnitOfMeasure[],
  meta: Partial<{ page: number; total: number; totalPages: number }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      limit: 10,
      total: meta.total ?? data.length,
      totalPages: meta.totalPages ?? (data.length ? 1 : 0),
    },
  }
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

  it('searches with the search button and filters by state', async () => {
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    const search = screen.getByRole('searchbox', { name: 'Buscar por nombre' })
    await user.type(search, 'kilo')
    expect(listUnits).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'kilo' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'activas')

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ page: 1, search: 'kilo', active: true }),
    )
  })

  it('clears search and state filters when nothing matches', async () => {
    listUnits.mockResolvedValue(pageOf([]))
    const { user } = renderPage('/catalogo/unidades?q=zzz&estado=inactivas')
    expect(await screen.findByText('Ninguna unidad coincide con los filtros')).toBeInTheDocument()

    listUnits.mockResolvedValue(pageOf([kilogram]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Kilogramo')).toBeInTheDocument()
    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        page: 1,
        search: undefined,
        active: undefined,
      }),
    )
    expect(screen.getByRole('searchbox', { name: 'Buscar por nombre' })).toHaveValue('')
    expect(screen.getByLabelText('Filtrar por estado')).toHaveValue('todos')
  })

  it('moves between pages from the table pagination', async () => {
    listUnits.mockImplementation((params) =>
      Promise.resolve(
        pageOf([params.page === 2 ? box : kilogram], {
          page: params.page ?? 1,
          total: 25,
          totalPages: 3,
        }),
      ),
    )
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    const pagination = screen.getByRole('navigation', {
      name: 'Paginación de unidades de medida',
    })
    await user.click(within(pagination).getByRole('button', { name: 'Página siguiente' }))

    expect(await screen.findByText('Cajas')).toBeInTheDocument()
    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
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

describe('UnitsPage edit and state', () => {
  it('edits a unit from the actions menu', async () => {
    updateUnit.mockResolvedValue({ ...kilogram, name: 'Kilogramos' })
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Kilogramo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar unidad de medida' }))
    expect(dialog.getByLabelText('Abreviatura')).toHaveValue('kg')
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Kilogramos')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Los cambios de la unidad Kilogramos (kg) se guardaron.'),
    ).toBeInTheDocument()
    expect(updateUnit).toHaveBeenCalledWith('unit-1', { name: 'Kilogramos' }, 'test-token')
  })

  it('asks for confirmation and explains that products keep the unit', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Kilogramo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar esta unidad?' })
    expect(dialog).toHaveTextContent('Los productos que ya la usan la conservan')
    expect(updateStatus).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByText('La unidad Kilogramo ahora está inactiva.')).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('unit-1', { active: false }, 'test-token')
  })

  it('activates an inactive unit', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Cajas')

    await user.click(screen.getByRole('button', { name: 'Acciones para Cajas' }))
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(await screen.findByText('La unidad Cajas ahora está activa.')).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('unit-2', { active: true }, 'test-token')
  })

  it('keeps the confirmation open with the api error', async () => {
    updateStatus.mockRejectedValue(new ApiError('State', 409, {}, 'ALREADY_IN_STATE'))
    const { user } = renderPage()
    await screen.findByText('Kilogramo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Kilogramo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La unidad ya tenía ese estado. Recarga el listado para ver su estado actual.',
    )
    expect(screen.getByRole('dialog', { name: '¿Desactivar esta unidad?' })).toBeInTheDocument()
  })

  it.each(['BRANCH_LEADER', 'BRANCH_ASSISTANT'])('hides the actions from the %s', async (role) => {
    auth.role = role
    renderPage()
    await screen.findByText('Kilogramo')

    expect(screen.queryByRole('button', { name: /Acciones para/ })).not.toBeInTheDocument()
  })
})
