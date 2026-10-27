import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
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
  salesService: { list: vi.fn(), get: vi.fn() },
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

function renderPage(path = '/pos/ventas') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <SalesPage />
    </MemoryRouter>,
  )
  return { user }
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

  it('opens the detail of a sale', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0001' }))

    expect(await screen.findByRole('dialog', { name: 'Venta V-20261026-0001' })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('sale-1', 'test-token')
  })

  it('shows the reason of a reversed sale', async () => {
    get.mockResolvedValue(
      buildSale({ id: 'sale-2', status: 'REVERSED', reversalReason: 'Error de cobro' }),
    )
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la venta V-20261026-0002' }))

    expect(await screen.findByText('Error de cobro')).toBeInTheDocument()
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
})
