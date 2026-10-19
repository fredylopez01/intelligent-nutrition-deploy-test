import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import type { CategoriesListParams, Category } from '../../types/category'

import { CategoriesPage } from './CategoriesPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn() },
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

const listCategories = vi.mocked(categoriesService.list)
const createCategory = vi.mocked(categoriesService.create)
const updateCategory = vi.mocked(categoriesService.update)
const updateStatus = vi.mocked(categoriesService.updateStatus)

const proteins: Category = {
  id: 'cat-1',
  name: 'Proteínas',
  description: 'Suplementos de proteína',
  active: true,
}

const snacks: Category = {
  id: 'cat-2',
  name: 'Snacks',
  description: 'Barras y galletas',
  active: false,
}

function pageOf(
  data: Category[],
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

function lastListParams(): CategoriesListParams {
  const call = listCategories.mock.lastCall
  if (!call) throw new Error('The categories list was never requested')
  return call[0]
}

function renderPage(path = '/catalogo/categorias') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <CategoriesPage />
    </MemoryRouter>,
  )
  return { user }
}

function searchBox() {
  return screen.getByRole('searchbox', { name: 'Buscar por nombre' })
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listCategories.mockResolvedValue(pageOf([proteins, snacks]))
})

describe('CategoriesPage list', () => {
  it('loads the first page and shows each category', async () => {
    renderPage()

    expect(await screen.findByText('Proteínas')).toBeInTheDocument()
    expect(screen.getByText('Barras y galletas')).toBeInTheDocument()
    expect(lastListParams()).toEqual({ page: 1, limit: 10, search: undefined, active: undefined })
  })

  it('searches only when the search is confirmed', async () => {
    const { user } = renderPage()
    await screen.findByText('Proteínas')

    await user.type(searchBox(), 'prote')
    expect(listCategories).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, search: 'prote' }))
  })

  it('filters by state and goes back to the first page', async () => {
    const { user } = renderPage('/catalogo/categorias?pagina=2')
    await screen.findByText('Proteínas')

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactivas')

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, active: false }))
  })

  it('reloads with the same filters', async () => {
    const { user } = renderPage('/catalogo/categorias?q=prote&estado=activas')
    await screen.findByText('Proteínas')
    const requests = listCategories.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(listCategories).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ search: 'prote', active: true })
  })

  it('moves between pages', async () => {
    listCategories.mockImplementation((params) =>
      Promise.resolve(pageOf([proteins], { page: params.page ?? 1, total: 25, totalPages: 3 })),
    )
    const { user } = renderPage()
    await screen.findByText('Proteínas')

    const pagination = screen.getByRole('navigation', { name: 'Paginación de categorías' })
    await user.click(within(pagination).getByRole('button', { name: 'Página siguiente' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
  })

  it('invites to register the first category when there are none', async () => {
    listCategories.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay categorías registradas')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('clears the search and the filters when nothing matches', async () => {
    listCategories.mockResolvedValue(pageOf([]))
    const { user } = renderPage('/catalogo/categorias?q=zzz&estado=inactivas')
    expect(
      await screen.findByText('Ninguna categoría coincide con los filtros'),
    ).toBeInTheDocument()

    listCategories.mockResolvedValue(pageOf([proteins]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Proteínas')).toBeInTheDocument()
    expect(lastListParams()).toMatchObject({ page: 1, search: undefined, active: undefined })
    expect(searchBox()).toHaveValue('')
  })

  it('shows the error and retries', async () => {
    listCategories.mockRejectedValueOnce(new ApiError('Boom', 500))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar las categorías. Intenta de nuevo.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Proteínas')).toBeInTheDocument()
  })
})

describe('CategoriesPage register', () => {
  it('registers a category and shows it in the list', async () => {
    createCategory.mockResolvedValue({ ...proteins, id: 'cat-3', name: 'Vitaminas' })
    const { user } = renderPage()
    await screen.findByText('Proteínas')
    listCategories.mockResolvedValue(pageOf([proteins]))

    await user.click(screen.getByRole('button', { name: 'Registrar categoría' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.type(dialog.getByLabelText('Nombre'), 'Vitaminas')
    await user.type(dialog.getByLabelText('Descripción'), 'Multivitamínicos')
    await user.click(dialog.getByRole('button', { name: 'Registrar categoría' }))

    expect(
      await screen.findByText('La categoría Vitaminas quedó registrada y activa.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers to register to the branch leader but not to the branch assistant', async () => {
    auth.role = 'BRANCH_LEADER'
    const { unmount } = render(
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>,
    )
    await screen.findByText('Proteínas')
    expect(screen.getByRole('button', { name: 'Registrar categoría' })).toBeInTheDocument()
    unmount()

    auth.role = 'BRANCH_ASSISTANT'
    renderPage()
    await screen.findByText('Proteínas')
    expect(screen.queryByRole('button', { name: 'Registrar categoría' })).not.toBeInTheDocument()
  })
})

describe('CategoriesPage edit and state', () => {
  it('edits a category from the table', async () => {
    updateCategory.mockResolvedValue({ ...proteins, description: 'Proteína en polvo' })
    const { user } = renderPage()
    await screen.findByText('Proteínas')

    await user.click(screen.getByRole('button', { name: 'Acciones para Proteínas' }))
    await user.click(screen.getByRole('menuitem', { name: 'Editar' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar categoría' }))
    expect(dialog.getByLabelText('Nombre')).toHaveValue('Proteínas')
    await user.clear(dialog.getByLabelText('Descripción'))
    await user.type(dialog.getByLabelText('Descripción'), 'Proteína en polvo')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Los cambios de la categoría Proteínas se guardaron.'),
    ).toBeInTheDocument()
    expect(updateCategory).toHaveBeenCalledWith(
      'cat-1',
      { description: 'Proteína en polvo' },
      'test-token',
    )
  })

  it('asks for confirmation before deactivating and explains the effect on products', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Proteínas')

    await user.click(screen.getByRole('button', { name: 'Acciones para Proteínas' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar esta categoría?' })
    expect(dialog).toHaveTextContent('Los productos que ya la usan la conservan')
    expect(updateStatus).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(
      await screen.findByText('La categoría Proteínas ahora está inactiva.'),
    ).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('cat-1', { active: false }, 'test-token')
  })

  it('lets the branch leader edit but not change the state', async () => {
    auth.role = 'BRANCH_LEADER'
    const { user } = renderPage()
    await screen.findByText('Proteínas')

    await user.click(screen.getByRole('button', { name: 'Acciones para Proteínas' }))

    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Desactivar' })).not.toBeInTheDocument()
  })

  it('only lets the branch assistant consult', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderPage()
    await screen.findByText('Proteínas')

    expect(screen.queryByRole('button', { name: /Acciones para/ })).not.toBeInTheDocument()
  })
})
