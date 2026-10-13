import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { unitsService } from '../../services/units.service'
import { CATEGORIES, UNITS, buildProduct, optionsPage } from '../../test-utils/products'
import type { Product, ProductsListParams } from '../../types/product'

import { ProductsPage } from './ProductsPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn(), create: vi.fn(), updateStatus: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
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

const listProducts = vi.mocked(productsService.list)
const createProduct = vi.mocked(productsService.create)
const updateStatus = vi.mocked(productsService.updateStatus)

const whey = buildProduct()
const creatine = buildProduct({
  id: 'product-creatine',
  name: 'Creatina 300 g',
  referenceCode: 'CREA-300G',
  active: false,
})

function pageOf(
  data: Product[],
  meta: Partial<{ page: number; total: number; totalPages: number }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      limit: 10,
      total: meta.total ?? data.length,
      totalPages: meta.totalPages ?? (data.length > 0 ? 1 : 0),
    },
  }
}

function lastListParams(): ProductsListParams {
  const call = listProducts.mock.lastCall
  if (!call) throw new Error('The products list was never requested')
  return call[0]
}

function renderPage(path = '/catalogo') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProductsPage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listProducts.mockResolvedValue(pageOf([whey, creatine]))
  vi.mocked(categoriesService.list).mockResolvedValue(optionsPage(CATEGORIES))
  vi.mocked(unitsService.list).mockResolvedValue(optionsPage(UNITS))
})

describe('ProductsPage list', () => {
  it('loads the first page and shows the products', async () => {
    renderPage()

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(screen.getByText('CREA-300G')).toBeInTheDocument()
    expect(lastListParams()).toEqual({
      page: 1,
      limit: 10,
      search: undefined,
      categoryId: undefined,
      unitOfMeasureId: undefined,
      active: undefined,
    })
  })

  it('searches by name or code only when the search is confirmed', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), 'whey')
    expect(listProducts).toHaveBeenCalledTimes(1)
    await user.keyboard('{Enter}')

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, search: 'whey' }))
  })

  it('filters by category, unit and state and goes back to the first page', async () => {
    const { user } = renderPage('/catalogo?pagina=3')
    await screen.findByText('Whey Protein 2 lb')
    await waitFor(() =>
      expect(
        within(screen.getByLabelText('Filtrar por categoría')).getAllByRole('option'),
      ).toHaveLength(3),
    )

    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'Vitaminas')
    await user.selectOptions(screen.getByLabelText('Filtrar por unidad de medida'), 'Kilogramo')
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactivos')

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        page: 1,
        categoryId: 'cat-vitamins',
        unitOfMeasureId: 'unit-kg',
        active: false,
      }),
    )
  })

  it('offers inactive categories and units in the filters, marked as such', async () => {
    vi.mocked(categoriesService.list).mockResolvedValue(
      optionsPage([
        ...CATEGORIES,
        { id: 'cat-old', name: 'Snacks', description: null, active: false },
      ]),
    )
    renderPage()

    expect(await screen.findByRole('option', { name: 'Snacks (inactiva)' })).toBeInTheDocument()
    expect(categoriesService.list).toHaveBeenCalledWith(
      { page: 1, limit: 100, active: undefined },
      'test-token',
    )
  })

  it('reloads with the same filters', async () => {
    const { user } = renderPage('/catalogo?q=whey&estado=activos')
    await screen.findByText('Whey Protein 2 lb')
    const requests = listProducts.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ search: 'whey', active: true })
  })

  it('moves between pages', async () => {
    listProducts.mockImplementation((params) =>
      Promise.resolve(pageOf([whey], { page: params.page ?? 1, total: 25, totalPages: 3 })),
    )
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
  })

  it('clears every filter when nothing matches', async () => {
    listProducts.mockResolvedValue(pageOf([]))
    const { user } = renderPage(
      '/catalogo?q=zzz&categoria=cat-protein&unidad=unit-kg&estado=inactivos',
    )
    expect(await screen.findByText('Ningún producto coincide con los filtros')).toBeInTheDocument()

    listProducts.mockResolvedValue(pageOf([whey]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(lastListParams()).toMatchObject({
      page: 1,
      search: undefined,
      categoryId: undefined,
      unitOfMeasureId: undefined,
      active: undefined,
    })
  })

  it('invites to register the first product when the catalog is empty', async () => {
    listProducts.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay productos en el catálogo')).toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    listProducts.mockRejectedValueOnce(new ApiError('Boom', 500))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los productos. Intenta de nuevo.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })
})

describe('ProductsPage register', () => {
  it('registers a product and confirms it', async () => {
    createProduct.mockResolvedValue(
      buildProduct({ id: 'product-new', name: 'Omega 3', referenceCode: 'OMEGA-3' }),
    )
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Registrar producto' }))
    const dialog = within(screen.getByRole('dialog'))
    await waitFor(() => expect(dialog.getByLabelText('Categoría')).toBeEnabled())
    await user.type(dialog.getByLabelText('Nombre'), 'Omega 3')
    await user.type(dialog.getByLabelText('Código de referencia'), 'OMEGA-3')
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'Vitaminas')
    await user.selectOptions(dialog.getByLabelText('Unidad de medida'), 'Unidad (und)')
    await user.type(dialog.getByLabelText('Precio de venta (COP)'), '52000')
    await user.click(dialog.getByRole('button', { name: 'Registrar producto' }))

    expect(
      await screen.findByText('El producto Omega 3 (OMEGA-3) quedó registrado y activo.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lets the branch leader register but not the branch assistant', async () => {
    auth.role = 'BRANCH_LEADER'
    const { unmount } = render(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
    )
    await screen.findByText('Whey Protein 2 lb')
    expect(screen.getByRole('button', { name: 'Registrar producto' })).toBeInTheDocument()
    unmount()

    auth.role = 'BRANCH_ASSISTANT'
    renderPage()
    await screen.findByText('Whey Protein 2 lb')
    expect(screen.queryByRole('button', { name: 'Registrar producto' })).not.toBeInTheDocument()
  })
})

describe('ProductsPage state', () => {
  it('asks for confirmation and explains what an inactive product cannot do', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Acciones para Whey Protein 2 lb' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este producto?' })
    expect(dialog).toHaveTextContent('no se podrá asignar a sedes')
    expect(dialog).toHaveTextContent('Su historial y existencias se conservan')
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(
      await screen.findByText('El producto Whey Protein 2 lb ahora está inactivo.'),
    ).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('product-whey', { active: false }, 'test-token')
  })

  it('activates an inactive product', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Creatina 300 g')

    await user.click(screen.getByRole('button', { name: 'Acciones para Creatina 300 g' }))
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(
      await screen.findByText('El producto Creatina 300 g ahora está activo.'),
    ).toBeInTheDocument()
  })

  it('keeps the confirmation open with the api error', async () => {
    updateStatus.mockRejectedValue(new ApiError('State', 409, {}, 'ALREADY_IN_STATE'))
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.click(screen.getByRole('button', { name: 'Acciones para Whey Protein 2 lb' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El producto ya tenía ese estado. Recarga para ver su estado actual.',
    )
  })

  it('hides the state actions from the branch assistant', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderPage()
    await screen.findByText('Whey Protein 2 lb')

    expect(screen.queryByRole('button', { name: /Acciones para/ })).not.toBeInTheDocument()
  })
})
