import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { inventoryMovementsService } from '../../services/inventoryMovements.service'
import { productsService } from '../../services/products.service'
import {
  CENTRO,
  NORTE,
  WHEY_ITEM,
  buildMovement,
  inventoryPage,
} from '../../test-utils/inventoryMovements'
import type { InventoryMovement, MovementsListParams } from '../../types/inventoryMovement'

import { MovementsPage } from './MovementsPage'

const auth = vi.hoisted(() => ({
  role: 'BRANCH_LEADER',
  branches: [] as { id: string; name: string }[],
}))

vi.mock('../../services/inventoryMovements.service', () => ({
  inventoryMovementsService: {
    list: vi.fn(),
    create: vi.fn(),
  },
}))

vi.mock('../../services/inventory.service', () => ({
  inventoryService: {
    listByBranch: vi.fn(),
    getProductInBranch: vi.fn(),
    availability: vi.fn(),
  },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
}))

vi.mock('../../services/generalStock.service', () => ({
  generalStockService: { getByProduct: vi.fn() },
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

const listMovements = vi.mocked(inventoryMovementsService.list)
const listBranches = vi.mocked(branchesService.list)

function movementsPage(data: InventoryMovement[], total = data.length) {
  return {
    data,
    meta: { page: 1, limit: 20, total, totalPages: total ? Math.ceil(total / 20) : 0 },
  }
}

function lastParams(): MovementsListParams {
  const call = listMovements.mock.lastCall
  if (!call) throw new Error('The movements were never requested')
  return call[0]
}

function renderPage(path = '/inventario/movimientos') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <MovementsPage />
    </MemoryRouter>,
  )
  return { user }
}

const exit = buildMovement()
const incoming = buildMovement({
  id: 'movement-2',
  movementType: 'TRANSFER',
  quantity: 4,
  originBranch: { id: NORTE.id, name: NORTE.name },
  branch: { id: CENTRO.id, name: CENTRO.name },
  observation: null,
  movementAt: '2026-10-25T15:00:00.000Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'BRANCH_LEADER'
  auth.branches = [{ id: CENTRO.id, name: CENTRO.name }]
  listMovements.mockResolvedValue(movementsPage([exit, incoming]))
  vi.mocked(inventoryService.listByBranch).mockResolvedValue(inventoryPage([WHEY_ITEM]))
  vi.mocked(productsService.list).mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
  })
  listBranches.mockResolvedValue({
    data: [
      { ...CENTRO, address: 'Calle 1', phone: '3000000000' },
      { ...NORTE, address: 'Calle 2', phone: '3000000001' },
    ],
    meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
  } as never)
})

describe('MovementsPage list', () => {
  it('lists the movements of the assigned branch with their sign for that branch', async () => {
    renderPage()

    const exitRow = (await screen.findByText('Salida')).closest('tr') as HTMLElement
    expect(within(exitRow).getAllByText('Whey Protein 2 lb')).not.toHaveLength(0)
    expect(within(exitRow).getByText('−3 und')).toBeInTheDocument()
    expect(within(exitRow).getByText('31 ene 2027')).toBeInTheDocument()
    const transferRow = screen.getByText('Traslado').closest('tr') as HTMLElement
    expect(within(transferRow).getByText('+4 und')).toBeInTheDocument()
    expect(within(transferRow).getByText('Norte → Centro')).toBeInTheDocument()
    expect(lastParams()).toMatchObject({ page: 1, limit: 20, branchId: CENTRO.id })
  })

  it('filters by type, product and date range', async () => {
    const { user } = renderPage()
    await screen.findByText('Salida')

    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'TRANSFER')
    await user.selectOptions(screen.getByLabelText('Filtrar por producto'), WHEY_ITEM.product.id)
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')
    await user.type(screen.getByLabelText('Hasta'), '2026-10-26')

    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        branchId: CENTRO.id,
        movementType: 'TRANSFER',
        productId: WHEY_ITEM.product.id,
        from: '2026-10-01',
        to: '2026-10-26',
      }),
    )
  })

  it('does not query an inverted date range', async () => {
    renderPage('/inventario/movimientos?desde=2026-10-20&hasta=2026-10-01')

    expect(
      await screen.findByText('La fecha inicial debe ser anterior o igual a la fecha final.'),
    ).toBeInTheDocument()
    expect(listMovements).not.toHaveBeenCalled()
  })

  it('clears the filters but keeps the branch when nothing matches', async () => {
    listMovements.mockResolvedValue(movementsPage([]))
    const { user } = renderPage('/inventario/movimientos?tipo=EXIT')
    expect(
      await screen.findByText('Ningún movimiento coincide con los filtros'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => expect(lastParams().movementType).toBeUndefined())
    expect(lastParams().branchId).toBe(CENTRO.id)
  })

  it('explains an empty history', async () => {
    listMovements.mockResolvedValue(movementsPage([]))
    renderPage()

    expect(await screen.findByText('Centro todavía no tiene movimientos')).toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    listMovements.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los movimientos. Intenta de nuevo.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Salida')).toBeInTheDocument()
  })

  it('opens the detail with the lot, the user and the observation', async () => {
    const { user } = renderPage()
    await screen.findByText('Salida')

    await user.click(screen.getAllByRole('button', { name: /Ver detalle del movimiento/ })[0])
    const dialog = within(screen.getByRole('dialog', { name: 'Detalle del movimiento' }))

    expect(dialog.getByText('Laura Pérez')).toBeInTheDocument()
    expect(dialog.getByText('Empaque roto')).toBeInTheDocument()
    expect(dialog.getByText(/Vence 31 ene 2027/)).toBeInTheDocument()
  })

  it('lets the superadmin see every branch at once', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { user } = renderPage()
    await screen.findByText('Salida')

    expect(lastParams().branchId).toBeUndefined()
    expect(screen.getByText('4 und')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Sede'), NORTE.id)

    await waitFor(() => expect(lastParams().branchId).toBe(NORTE.id))
  })

  it('tells a user without branches to ask for an assignment', async () => {
    auth.branches = []
    renderPage()

    expect(await screen.findByText('No tienes sedes asignadas')).toBeInTheDocument()
    expect(listMovements).not.toHaveBeenCalled()
  })
})

describe('MovementsPage actions by role', () => {
  it.each(['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'])(
    'lets the %s register an entry or exit',
    async (role) => {
      auth.role = role
      renderPage()
      await screen.findByText('Salida')

      expect(screen.getByRole('button', { name: 'Registrar entrada o salida' })).toBeInTheDocument()
    },
  )

  it('opens the entry or exit dialog', async () => {
    const { user } = renderPage()
    await screen.findByText('Salida')

    await user.click(screen.getByRole('button', { name: 'Registrar entrada o salida' }))

    expect(screen.getByRole('dialog', { name: 'Registrar entrada o salida' })).toBeInTheDocument()
  })
})
