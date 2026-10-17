import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { productsService } from '../../services/products.service'
import { unitsService } from '../../services/units.service'
import {
  BRANCHES,
  buildInventoryDetail,
  buildInventoryItem,
  inventoryPage,
  withoutThresholds,
} from '../../test-utils/inventory'
import { CATEGORIES, UNITS, buildProduct, optionsPage } from '../../test-utils/products'
import type { BranchInventoryParams } from '../../types/inventory'

import { InventoryPage } from './InventoryPage'

const auth = vi.hoisted(() => ({
  role: 'SUPERADMIN',
  branches: [] as { id: string; name: string }[],
}))

vi.mock('../../services/inventory.service', () => ({
  inventoryService: {
    listByBranch: vi.fn(),
    getProductInBranch: vi.fn(),
    assign: vi.fn(),
    updateMinimumStock: vi.fn(),
  },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
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

const listByBranch = vi.mocked(inventoryService.listByBranch)
const getProductInBranch = vi.mocked(inventoryService.getProductInBranch)
const assign = vi.mocked(inventoryService.assign)
const updateMinimumStock = vi.mocked(inventoryService.updateMinimumStock)
const listBranches = vi.mocked(branchesService.list)
const listProducts = vi.mocked(productsService.list)

const whey = buildInventoryItem()
const creatine = buildInventoryItem({
  product: {
    ...whey.product,
    id: 'product-creatine',
    name: 'Creatina 300 g',
    referenceCode: 'CREA-300G',
  },
  totalQuantity: 4,
  minimumStock: 10,
  lowStock: true,
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}

function renderPage(path = '/inventario') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <InventoryPage />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { user }
}

function lastListCall(): [string, BranchInventoryParams] {
  const call = listByBranch.mock.lastCall
  if (!call) throw new Error('The inventory was never requested')
  return [call[0], call[1]]
}

async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  productName: string,
  action: string,
) {
  await user.click(await screen.findByRole('button', { name: `Acciones para ${productName}` }))
  await user.click(screen.getByRole('menuitem', { name: action }))
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  auth.branches = []
  listBranches.mockResolvedValue({
    data: BRANCHES,
    meta: { page: 1, limit: 100, total: 3, totalPages: 1 },
  })
  vi.mocked(categoriesService.list).mockResolvedValue(optionsPage(CATEGORIES))
  vi.mocked(unitsService.list).mockResolvedValue(optionsPage(UNITS))
  listByBranch.mockResolvedValue(inventoryPage([whey, creatine]))
})

describe('InventoryPage', () => {
  it('shows the inventory of the first active branch to the superadmin', async () => {
    renderPage()

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(listBranches).toHaveBeenCalledWith({ page: 1, limit: 100 }, 'test-token')
    expect(screen.getByLabelText('Sede')).toHaveValue('branch-centro')
    expect(
      within(screen.getByLabelText('Sede'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Centro', 'Norte', 'Sur (inactiva)'])
    expect(lastListCall()).toEqual([
      'branch-centro',
      expect.objectContaining({ page: 1, limit: 10 }),
    ])
    expect(screen.getByText('Creatina 300 g').closest('tr')).toHaveClass(
      'inventory-table__row--low',
    )
  })

  it('changes the branch from the selector and keeps it in the url', async () => {
    const { user } = renderPage('/inventario?pagina=2')
    await screen.findByText('Whey Protein 2 lb')

    await user.selectOptions(screen.getByLabelText('Sede'), 'Norte')

    await waitFor(() => expect(lastListCall()[0]).toBe('branch-norte'))
    expect(lastListCall()[1]).toMatchObject({ page: 1 })
    expect(screen.getByTestId('location')).toHaveTextContent('sede=branch-norte')
  })

  it('lets the superadmin read an inactive branch but not change it', async () => {
    renderPage('/inventario?sede=branch-sur')

    expect(await screen.findByText(/Sur está inactiva/)).toBeInTheDocument()
    expect(lastListCall()[0]).toBe('branch-sur')
    expect(screen.getByRole('button', { name: 'Asignar producto' })).toBeDisabled()
  })

  it('uses the branches of the session for the branch leader', async () => {
    auth.role = 'BRANCH_LEADER'
    auth.branches = [
      { id: 'branch-norte', name: 'Norte' },
      { id: 'branch-centro', name: 'Centro' },
    ]
    renderPage()

    await screen.findByText('Whey Protein 2 lb')
    expect(listBranches).not.toHaveBeenCalled()
    expect(
      within(screen.getByLabelText('Sede'))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Centro', 'Norte'])
    expect(screen.getByRole('button', { name: 'Asignar producto' })).toBeEnabled()
  })

  it('hides the thresholds and the management actions from the branch assistant', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    auth.branches = [{ id: 'branch-centro', name: 'Centro' }]
    listByBranch.mockResolvedValue(inventoryPage([withoutThresholds(whey)]))
    renderPage('/inventario?stock=bajo-minimo')

    await screen.findByText('Whey Protein 2 lb')
    expect(screen.queryByRole('columnheader', { name: 'Stock mínimo' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Filtrar por nivel de stock')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Asignar producto' })).not.toBeInTheDocument()
    expect(lastListCall()[1].lowStock).toBeUndefined()
  })

  it('filters by category, low stock and search', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'Proteínas')
    await waitFor(() => expect(lastListCall()[1]).toMatchObject({ categoryId: 'cat-protein' }))

    await user.selectOptions(screen.getByLabelText('Filtrar por nivel de stock'), 'Bajo mínimo')
    await waitFor(() => expect(lastListCall()[1]).toMatchObject({ lowStock: true }))

    await user.selectOptions(screen.getByLabelText('Filtrar por nivel de stock'), 'En nivel')
    await waitFor(() => expect(lastListCall()[1]).toMatchObject({ lowStock: false }))

    await user.type(screen.getByLabelText('Buscar producto por nombre o código'), 'whey{Enter}')
    await waitFor(() => expect(lastListCall()[1]).toMatchObject({ search: 'whey' }))
  })

  it('clears the filters but keeps the branch when nothing matches', async () => {
    listByBranch.mockResolvedValue(inventoryPage([]))
    const { user } = renderPage('/inventario?sede=branch-norte&q=zzz&stock=bajo-minimo')

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() =>
      expect(lastListCall()).toEqual([
        'branch-norte',
        expect.objectContaining({ search: undefined, lowStock: undefined }),
      ]),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('?sede=branch-norte')
  })

  it('explains when the branch has no products yet', async () => {
    listByBranch.mockResolvedValue(inventoryPage([]))
    renderPage()

    expect(await screen.findByText('Centro todavía no tiene productos')).toBeInTheDocument()
  })

  it('tells the user when they have no branches assigned', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    auth.branches = []
    renderPage()

    expect(screen.getByText('No tienes sedes asignadas')).toBeInTheDocument()
    expect(listByBranch).not.toHaveBeenCalled()
  })

  it('lets the superadmin retry when the branches fail to load', async () => {
    listBranches.mockRejectedValueOnce(new ApiError('Error', 500))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar las sedes')
    expect(listByBranch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    listByBranch
      .mockRejectedValueOnce(new ApiError('Forbidden', 403, undefined, 'BRANCH_OUT_OF_SCOPE'))
      .mockResolvedValueOnce(inventoryPage([whey]))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes acceso al inventario de esta sede.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })

  it('shows the lots of a product', async () => {
    getProductInBranch.mockResolvedValue(buildInventoryDetail())
    const { user } = renderPage()

    await openRowAction(user, 'Whey Protein 2 lb', 'Ver lotes')

    const dialog = await screen.findByRole('dialog', { name: 'Whey Protein 2 lb' })
    expect(await within(dialog).findByText('31 dic 2026')).toBeInTheDocument()
    expect(getProductInBranch).toHaveBeenCalledWith('branch-centro', 'product-whey', 'test-token')
  })

  it('assigns a product to the branch and reloads the inventory', async () => {
    listProducts.mockResolvedValue(optionsPage([buildProduct()]))
    getProductInBranch.mockRejectedValue(
      new ApiError('Not assigned', 404, undefined, 'PRODUCT_NOT_ASSIGNED'),
    )
    assign.mockResolvedValue({
      id: 'lot-9',
      branchId: 'branch-centro',
      product: whey.product,
      quantity: 20,
      minimumStock: 5,
      lowStock: false,
      expirationDate: '2027-12-31T00:00:00Z',
      updatedAt: '2026-10-16T00:00:00Z',
    })
    const { user } = renderPage()
    await screen.findByText('Creatina 300 g')
    const callsBefore = listByBranch.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Asignar producto' }))
    const dialog = screen.getByRole('dialog', { name: 'Asignar producto a la sede' })
    await user.click(await within(dialog).findByRole('button', { name: /Whey Protein 2 lb/ }))
    await user.type(within(dialog).getByLabelText('Cantidad inicial'), '20')
    await user.clear(within(dialog).getByLabelText('Stock mínimo'))
    await user.type(within(dialog).getByLabelText('Stock mínimo'), '5')
    await user.type(within(dialog).getByLabelText('Fecha de vencimiento'), '2027-12-31')
    await user.click(within(dialog).getByRole('button', { name: 'Asignar a la sede' }))

    expect(
      await screen.findByText('Se asignaron 20 und de Whey Protein 2 lb a Centro.'),
    ).toBeInTheDocument()
    expect(assign).toHaveBeenCalledWith(
      'branch-centro',
      {
        productId: 'product-whey',
        quantity: 20,
        minimumStock: 5,
        expirationDate: '2027-12-31T00:00:00Z',
      },
      'test-token',
    )
    await waitFor(() => expect(listByBranch.mock.calls.length).toBe(callsBefore + 1))
  })

  it('updates the minimum stock in the row without reloading the list', async () => {
    updateMinimumStock.mockResolvedValue({
      branchId: 'branch-centro',
      productId: 'product-whey',
      minimumStock: 40,
      totalQuantity: 35,
      lowStock: true,
      lotsUpdated: 2,
      lots: [],
      updatedAt: '2026-10-16T00:00:00Z',
    })
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')
    const callsBefore = listByBranch.mock.calls.length

    await openRowAction(user, 'Whey Protein 2 lb', 'Editar stock mínimo')
    const dialog = screen.getByRole('dialog', { name: 'Editar stock mínimo' })
    await user.clear(within(dialog).getByLabelText('Nuevo stock mínimo'))
    await user.type(within(dialog).getByLabelText('Nuevo stock mínimo'), '40')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar stock mínimo' }))

    expect(
      await screen.findByText(
        'El stock mínimo de Whey Protein 2 lb ahora es 40 und y el producto quedó bajo mínimo.',
      ),
    ).toBeInTheDocument()
    const row = screen.getByText('Whey Protein 2 lb').closest('tr') as HTMLElement
    expect(within(row).getByText('40')).toBeInTheDocument()
    expect(within(row).getByText('Bajo mínimo')).toBeInTheDocument()
    expect(row).toHaveClass('inventory-table__row--low')
    expect(listByBranch.mock.calls.length).toBe(callsBefore)
  })

  it('does not offer to edit the minimum stock of an inactive branch', async () => {
    const { user } = renderPage('/inventario?sede=branch-sur')

    await user.click(await screen.findByRole('button', { name: 'Acciones para Whey Protein 2 lb' }))

    expect(screen.queryByRole('menuitem', { name: 'Editar stock mínimo' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Ver lotes' })).toBeInTheDocument()
  })
})
