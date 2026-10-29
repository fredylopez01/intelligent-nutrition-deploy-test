import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { salesService } from '../../services/sales.service'
import { unitsService } from '../../services/units.service'
import { buildSellable } from '../../test-utils/sales'
import type { SellableProduct } from '../../types/sale'

import { PosPage } from './PosPage'

const auth = vi.hoisted(() => ({
  role: 'BRANCH_ASSISTANT',
  branches: [] as { id: string; name: string }[],
}))

vi.mock('../../services/sales.service', () => ({
  salesService: { sellableProducts: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
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

const sellable = vi.mocked(salesService.sellableProducts)
const whey = buildSellable()
const creatine = buildSellable({
  productId: 'product-creatine',
  name: 'Creatina 300 g',
  referenceCode: 'CREA-300',
  price: '99900.00',
  availableQuantity: 1,
  primaryImageUrl: 'https://cdn.example.com/creatina.webp',
})

function page(data: SellableProduct[]) {
  return { data, meta: { page: 1, limit: 12, total: data.length, totalPages: data.length ? 1 : 0 } }
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderPage(path = '/pos') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <PosPage />
      <LocationProbe />
    </MemoryRouter>,
  )
  return { user, url: () => screen.getByTestId('location').textContent }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'BRANCH_ASSISTANT'
  auth.branches = [{ id: 'branch-centro', name: 'Centro' }]
  sellable.mockResolvedValue(page([whey, creatine]))
  const empty = { data: [], meta: { page: 1, limit: 100, total: 0, totalPages: 0 } }
  vi.mocked(categoriesService.list).mockResolvedValue({
    data: [{ id: 'cat-protein', name: 'Proteínas', description: null, active: true }],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never)
  vi.mocked(unitsService.list).mockResolvedValue(empty as never)
})

describe('PosPage', () => {
  it('shows each sellable product with price, stock and image', async () => {
    renderPage()

    const card = (await screen.findByText('Whey Protein 2 lb')).closest('li') as HTMLElement
    expect(within(card).getByText('$ 145.000')).toBeInTheDocument()
    expect(within(card).getByText('3 und disponibles')).toBeInTheDocument()
    expect(within(card).getByText('Sin imagen')).toBeInTheDocument()
    expect(sellable).toHaveBeenCalledWith(
      'branch-centro',
      { page: 1, limit: 12, search: undefined, categoryId: undefined },
      'test-token',
    )
  })

  it('adds products to the sale up to the available stock', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }))
    await user.click(screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }))
    await user.click(screen.getByRole('button', { name: 'Agregar Creatina 300 g a la venta' }))

    const selection = within(screen.getByRole('list', { name: 'Productos de la venta' }))
    expect(selection.getByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.getByLabelText('2 en la venta')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Creatina 300 g: ya agregaste todas las unidades disponibles',
      }),
    ).toBeDisabled()
    expect(screen.getByText('$ 389.900')).toBeInTheDocument()
  })

  it('changes and removes quantities from the selection', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }))
    await user.click(
      screen.getByRole('button', { name: 'Agregar una unidad de Whey Protein 2 lb' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Agregar una unidad de Whey Protein 2 lb' }),
    )
    expect(
      screen.getByRole('button', { name: 'Agregar una unidad de Whey Protein 2 lb' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Quitar Whey Protein 2 lb de la venta' }))

    expect(screen.getByText(/Agrega productos desde el panel/)).toBeInTheDocument()
  })

  it('searches and filters by category', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.type(screen.getByRole('searchbox', { name: /Buscar producto/ }), 'whey')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'cat-protein')

    await waitFor(() =>
      expect(sellable).toHaveBeenLastCalledWith(
        'branch-centro',
        { page: 1, limit: 12, search: 'whey', categoryId: 'cat-protein' },
        'test-token',
      ),
    )
  })

  it('explains an empty branch', async () => {
    sellable.mockResolvedValue(page([]))
    renderPage()

    expect(await screen.findByText('Centro no tiene productos para vender')).toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    sellable.mockRejectedValueOnce(new ApiError('No', 403, {}, 'BRANCH_SCOPE_VIOLATION'))
    const { user } = renderPage()

    expect(await screen.findByText('No tienes acceso a esta sede.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })

  it('lets the superadmin only consult the products', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [{ id: 'branch-norte', name: 'Norte', active: true, address: 'Calle 2', phone: '3' }],
      meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never)
    renderPage()

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Las ventas las registran el líder y el ayudante/)).toBeInTheDocument()
  })

  it('shows the loading state while the products arrive', async () => {
    sellable.mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(await screen.findByRole('status')).toHaveTextContent('Cargando productos vendibles...')
  })

  it('reloads the products from the toolbar', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    sellable.mockReturnValue(new Promise(() => {}))
    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    expect(await screen.findByRole('button', { name: 'Cargando...' })).toBeDisabled()
    expect(sellable).toHaveBeenCalledTimes(2)
  })

  it('changes the branch from the selector and keeps it in the url', async () => {
    auth.branches = [
      { id: 'branch-centro', name: 'Centro' },
      { id: 'branch-norte', name: 'Norte' },
    ]
    const { user, url } = renderPage('/pos?pagina=2')
    await screen.findByText('Whey Protein 2 lb')

    await user.selectOptions(screen.getByLabelText('Sede'), 'branch-norte')

    await waitFor(() =>
      expect(sellable).toHaveBeenLastCalledWith(
        'branch-norte',
        { page: 1, limit: 12, search: undefined, categoryId: undefined },
        'test-token',
      ),
    )
    expect(url()).toBe('/pos?sede=branch-norte')
  })

  it('discards the current sale when the branch changes', async () => {
    auth.branches = [
      { id: 'branch-centro', name: 'Centro' },
      { id: 'branch-norte', name: 'Norte' },
    ]
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')
    await user.click(screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' }))
    expect(screen.getByLabelText('1 en la venta')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Sede'), 'branch-norte')

    expect(await screen.findByText(/Agrega productos desde el panel/)).toBeInTheDocument()
    expect(screen.queryByLabelText('1 en la venta')).not.toBeInTheDocument()
  })

  it('marks a product without remaining units', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')
    const add = () => screen.getByRole('button', { name: 'Agregar Whey Protein 2 lb a la venta' })

    await user.click(add())
    await user.click(add())
    await user.click(add())

    const exhausted = screen.getByRole('button', {
      name: 'Whey Protein 2 lb: ya agregaste todas las unidades disponibles',
    })
    expect(exhausted).toBeDisabled()
    expect(exhausted).toHaveTextContent('Sin más unidades')
  })

  it('paginates the products and resets the page when the size changes', async () => {
    sellable.mockResolvedValue({
      data: [whey],
      meta: { page: 1, limit: 12, total: 30, totalPages: 3 },
    })
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    expect(screen.getByText('Mostrando 1–12 de 30')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Página 2 de 3' }))
    await waitFor(() =>
      expect(sellable).toHaveBeenLastCalledWith(
        'branch-centro',
        { page: 2, limit: 12, search: undefined, categoryId: undefined },
        'test-token',
      ),
    )

    await user.selectOptions(screen.getByLabelText('Filas por página'), '24')
    await waitFor(() =>
      expect(sellable).toHaveBeenLastCalledWith(
        'branch-centro',
        { page: 1, limit: 24, search: undefined, categoryId: undefined },
        'test-token',
      ),
    )
  })

  it('clears the filters from the empty result state', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    sellable.mockResolvedValue(page([]))
    await user.type(screen.getByRole('searchbox', { name: /Buscar producto/ }), 'zzz')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    expect(await screen.findByText('Ningún producto vendible coincide')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() =>
      expect(sellable).toHaveBeenLastCalledWith(
        'branch-centro',
        { page: 1, limit: 12, search: undefined, categoryId: undefined },
        'test-token',
      ),
    )
  })

  it('offers every active category in the filter', async () => {
    renderPage()
    await screen.findByText('Whey Protein 2 lb')

    const filter = screen.getByLabelText('Filtrar por categoría')
    expect(within(filter).getByRole('option', { name: 'Todas las categorías' })).toBeInTheDocument()
    expect(within(filter).getByRole('option', { name: 'Proteínas' })).toBeInTheDocument()
  })

  it('explains when the branches cannot be loaded', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({
        data: [{ id: 'branch-norte', name: 'Norte', active: true, address: 'Calle 2', phone: '3' }],
        meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
      } as never)
    const { user } = renderPage()

    expect(
      await screen.findByText('No fue posible cargar las sedes. Intenta de nuevo.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })

  it('stops the superadmin without active branches', async () => {
    auth.role = 'SUPERADMIN'
    auth.branches = []
    const { branchesService } = await import('../../services/branches.service')
    vi.mocked(branchesService.list).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never)
    renderPage()

    expect(await screen.findByText('No tienes sedes activas asignadas')).toBeInTheDocument()
  })
})
