import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { salesService } from '../../services/sales.service'
import { buildSale, buildSaleSummary } from '../../test-utils/sales'
import type { SaleSummary, SalesListParams } from '../../types/sale'

import { SalesPage } from './SalesPage'

const auth = vi.hoisted(() => ({
  role: 'BRANCH_LEADER',
  branches: [] as { id: string; name: string }[],
}))

vi.mock('../../services/sales.service', () => ({
  salesService: { list: vi.fn(), get: vi.fn(), reverse: vi.fn() },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'me', role: { name: auth.role }, branches: auth.branches },
  }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const list = vi.mocked(salesService.list)
const get = vi.mocked(salesService.get)
const reverse = vi.mocked(salesService.reverse)

const completed = buildSaleSummary()
const reversed = buildSaleSummary({
  id: 'sale-2',
  saleNumber: 'V-20261026-0002',
  status: 'REVERSED',
  total: '99900.00',
  customer: { id: 'customer-1', fullName: 'Ana Gómez' },
  itemsCount: 3,
})

function page(data: SaleSummary[]) {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 } }
}

function lastParams(): SalesListParams {
  const call = list.mock.lastCall
  if (!call) throw new Error('The sales were never requested')
  return call[0]
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderPage(path = '/pos/ventas') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <SalesPage />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { user, url: () => screen.getByTestId('location').textContent }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'BRANCH_LEADER'
  auth.branches = [{ id: 'branch-centro', name: 'Centro' }]
  list.mockResolvedValue(page([completed, reversed]))
  get.mockResolvedValue(buildSale())
})

describe('SalesPage', () => {
  it('lists the sales of the branch with total and status', async () => {
    renderPage()

    const row = (await screen.findByText('V-20261026-0002')).closest('tr') as HTMLElement
    expect(within(row).getByText('Reversada')).toBeInTheDocument()
    expect(within(row).getByText('Ana Gómez')).toBeInTheDocument()
    expect(within(row).getByText(/3 productos/)).toBeInTheDocument()
    const completedRow = screen.getByText('V-20261026-0001').closest('tr') as HTMLElement
    expect(within(completedRow).getByText('Completada')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ page: 1, limit: 20, branchId: 'branch-centro' })
  })

  it('searches by number and filters by status and dates', async () => {
    const { user } = renderPage()
    await screen.findByText('V-20261026-0002')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por número de venta' }), 'V-2026')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'REVERSED')
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')

    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        search: 'V-2026',
        status: 'REVERSED',
        from: '2026-10-01',
      }),
    )
  })

  it('opens the detail and reverses a completed sale', async () => {
    reverse.mockResolvedValue(buildSale({ status: 'REVERSED' }))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0001' }))
    await user.click(await screen.findByRole('button', { name: /Reversar por/ }))
    await user.type(screen.getByLabelText('Motivo de la reversión'), 'Sabor equivocado')
    await user.click(screen.getByRole('button', { name: 'Reversar venta' }))

    expect(
      await screen.findByText(
        'La venta V-20261026-0001 quedó reversada y sus unidades volvieron al inventario de Centro.',
      ),
    ).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not offer to reverse a reversed sale', async () => {
    get.mockResolvedValue(
      buildSale({ id: 'sale-2', status: 'REVERSED', reversalReason: 'Error de cobro' }),
    )
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0002' }))

    expect(await screen.findByText('Error de cobro')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reversar por/ })).not.toBeInTheDocument()
  })

  it('shows every branch to the superadmin', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [{ id: 'branch-centro', name: 'Centro', active: true, address: 'Calle 1', phone: '3' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never)
    renderPage()

    await screen.findByText('V-20261026-0002')
    expect(lastParams().branchId).toBeUndefined()
    expect(screen.getByRole('columnheader', { name: 'Sede' })).toBeInTheDocument()
  })

  it('offers to clear the filters when nothing matches', async () => {
    list.mockResolvedValue(page([]))
    const { user } = renderPage('/pos/ventas?estado=REVERSED')

    expect(await screen.findByText('Ninguna venta coincide con los filtros')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => expect(lastParams().status).toBeUndefined())
  })

  it('shows the error and retries', async () => {
    list.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderPage()

    expect(
      await screen.findByText('No fue posible cargar las ventas. Intenta de nuevo.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('V-20261026-0002')).toBeInTheDocument()
  })

  it('shows the loading state while the sales arrive', async () => {
    list.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(await screen.findByText('Cargando ventas...')).toBeInTheDocument()
  })

  it('reloads the sales from the toolbar', async () => {
    const { user } = renderPage()
    await screen.findByText('V-20261026-0002')

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  })

  it('sends both dates and the status to the api', async () => {
    const { user } = renderPage()
    await screen.findByText('V-20261026-0002')

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'REVERSED')
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-31')

    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        status: 'REVERSED',
        from: '2026-10-01',
        to: '2026-10-31',
      }),
    )
  })

  it('warns when the date range is inverted', async () => {
    const { user } = renderPage()
    await screen.findByText('V-20261026-0002')

    await user.type(screen.getByLabelText('Desde'), '2026-10-31')
    await waitFor(() => expect(lastParams().from).toBe('2026-10-31'))
    const requests = list.mock.calls.length

    await user.type(screen.getByLabelText('Hasta'), '2026-10-01')

    expect(
      await screen.findByText('La fecha inicial debe ser anterior o igual a la fecha final.'),
    ).toBeInTheDocument()
    expect(list.mock.calls.length).toBe(requests)
  })

  it('paginates and resets the page when the size changes', async () => {
    list.mockResolvedValue({
      data: [completed],
      meta: { page: 1, limit: 20, total: 45, totalPages: 3 },
    })
    const { user } = renderPage()
    await screen.findByText('V-20261026-0001')

    expect(screen.getByText('Mostrando 1–20 de 45')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Página 2 de 3' }))
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2, limit: 20 }))

    await user.selectOptions(screen.getByLabelText('Filas por página'), '50')
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 1, limit: 50 }))
  })

  it('explains an empty history without filters', async () => {
    list.mockResolvedValue(page([]))
    renderPage()

    expect(await screen.findByText('Centro todavía no tiene ventas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('explains an empty history when the superadmin sees every branch', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [{ id: 'branch-centro', name: 'Centro', active: true, address: 'Calle 1', phone: '3' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never)
    list.mockResolvedValue(page([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay ventas')).toBeInTheDocument()
  })

  it('filters by branch from the selector', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [
        { id: 'branch-centro', name: 'Centro', active: true, address: 'Calle 1', phone: '3' },
        { id: 'branch-norte', name: 'Norte', active: false, address: 'Calle 2', phone: '4' },
      ],
      meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
    } as never)
    const { user, url } = renderPage()
    await screen.findByText('V-20261026-0002')

    const selector = screen.getByLabelText('Sede')
    expect(within(selector).getByRole('option', { name: 'Todas las sedes' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Norte (inactiva)' })).toBeInTheDocument()

    await user.selectOptions(selector, 'branch-centro')

    await waitFor(() => expect(lastParams().branchId).toBe('branch-centro'))
    expect(url()).toBe('/pos/ventas?sede=branch-centro')
  })

  it('shows the loading state of the detail', async () => {
    get.mockReturnValue(new Promise(() => {}))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0001' }))

    const dialog = screen.getByRole('dialog', { name: 'Venta V-20261026-0001' })
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Cargando la venta V-20261026-0001...',
    )
  })

  it('explains when the detail cannot be loaded', async () => {
    get.mockRejectedValue(new ApiError('Missing', 404, {}, 'SALE_NOT_FOUND'))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0001' }))

    expect(
      await screen.findByText('La venta ya no existe. Recarga el listado.'),
    ).toBeInTheDocument()
  })

  it('closes the detail without reversing', async () => {
    const { user } = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0001' }))

    const dialog = screen.getByRole('dialog', { name: 'Venta V-20261026-0001' })
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(reverse).not.toHaveBeenCalled()
  })

  it('stops a user without assigned branches', async () => {
    auth.branches = []
    renderPage()

    expect(await screen.findByText('No tienes sedes asignadas')).toBeInTheDocument()
  })
})
