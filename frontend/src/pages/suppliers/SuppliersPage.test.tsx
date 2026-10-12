import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { suppliersService } from '../../services/suppliers.service'
import type { Supplier, SuppliersListParams, SuppliersListResponse } from '../../types/supplier'

import { SuppliersPage } from './SuppliersPage'

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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

const listSuppliers = vi.mocked(suppliersService.list)

const norte: Supplier = {
  id: 'supplier-1',
  commercialName: 'Suplementos Norte',
  person: {
    businessName: 'Suplementos Norte SAS',
    documentNumber: '900123456',
    documentType: { code: 'NIT', name: 'NIT' },
    email: 'contacto@norte.test',
    phone: '3001112222',
    address: 'Calle 10 # 20-30',
    active: true,
  },
}

function pageOf(data: Supplier[], extra: Partial<SuppliersListResponse['meta']> = {}) {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0, ...extra },
  } as SuppliersListResponse
}

function lastListParams(): SuppliersListParams {
  const call = listSuppliers.mock.lastCall
  if (!call) throw new Error('The suppliers list was never requested')
  return call[0]
}

function renderPage() {
  const user = userEvent.setup()
  const { container } = render(
    <MemoryRouter>
      <SuppliersPage />
    </MemoryRouter>,
  )
  return { user, container }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('SuppliersPage filters', () => {
  beforeEach(() => {
    listSuppliers.mockResolvedValue(pageOf([norte]))
  })

  it('loads the first page without filters', async () => {
    renderPage()

    expect(await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })).toBeInTheDocument()
    expect(listSuppliers).toHaveBeenCalledWith(
      { page: 1, limit: 10, search: undefined, active: undefined },
      'test-token',
    )
  })

  it('applies the search filter with the trimmed text', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o documento' }),
      '  Norte {Enter}',
    )

    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'Norte', page: 1 }))
  })

  it('ignores a search made only of spaces', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o documento' }),
      '   {Enter}',
    )

    expect(lastListParams().search).toBeUndefined()
  })

  it.each([
    ['Activos', true],
    ['Inactivos', false],
  ])('applies the "%s" status filter', async (label, active) => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filtrar por estado' }), label)

    await waitFor(() => expect(lastListParams()).toMatchObject({ active, page: 1 }))
  })

  it('removes the status filter when going back to every status', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })
    const statusFilter = screen.getByRole('combobox', { name: 'Filtrar por estado' })

    await user.selectOptions(statusFilter, 'Inactivos')
    await user.selectOptions(statusFilter, 'Todos los estados')

    await waitFor(() => expect(lastListParams().active).toBeUndefined())
  })

  it('combines the search and status filters in the same request', async () => {
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o documento' }),
      'Norte{Enter}',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Activos',
    )

    await waitFor(() =>
      expect(lastListParams()).toEqual({ page: 1, limit: 10, search: 'Norte', active: true }),
    )
  })

  it('goes back to the first page when a filter changes', async () => {
    listSuppliers.mockResolvedValue(pageOf([norte], { total: 15, totalPages: 2 }))
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Siguiente' }))
    await waitFor(() => expect(lastListParams().page).toBe(2))

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Activos',
    )

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, active: true }))
  })
})

describe('SuppliersPage empty list', () => {
  it('invites to register the first supplier when there are no suppliers', async () => {
    listSuppliers.mockResolvedValue(pageOf([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay proveedores registrados')).toBeInTheDocument()
    expect(screen.getByText('Registra el primer proveedor para comenzar.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar proveedor' })).toHaveLength(2)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('explains that no supplier matches when a filter is applied', async () => {
    listSuppliers.mockResolvedValueOnce(pageOf([norte])).mockResolvedValue(pageOf([]))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o documento' }),
      'NoExiste{Enter}',
    )

    expect(await screen.findByText('Ningún proveedor coincide con los filtros')).toBeInTheDocument()
    expect(
      screen.getByText('Prueba con otro término de búsqueda o cambia el filtro de estado.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('SuppliersPage loading and error states', () => {
  it('shows the skeleton while the first load is pending', () => {
    listSuppliers.mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()

    expect(container.querySelector('.suppliers-page__skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the error message and retries the request', async () => {
    listSuppliers
      .mockRejectedValueOnce(new Error('No fue posible cargar los proveedores.'))
      .mockResolvedValue(pageOf([norte]))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los proveedores.',
    )

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })).toBeInTheDocument()
    expect(listSuppliers).toHaveBeenCalledTimes(2)
  })
})

describe('SuppliersPage pagination', () => {
  it('shows the pagination controls with the first page and disables going back', async () => {
    listSuppliers.mockResolvedValue(pageOf([norte], { page: 1, total: 30, totalPages: 3 }))
    renderPage()

    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled()
  })

  it('requests the next page and enables going back', async () => {
    listSuppliers.mockImplementation((params) =>
      Promise.resolve(pageOf([norte], { page: params.page ?? 1, total: 30, totalPages: 3 })),
    )
    const { user } = renderPage()
    await screen.findByText('Página 1 de 3')

    await user.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeEnabled()
    expect(lastListParams().page).toBe(2)
  })

  it('hides the pagination controls when there is a single page', async () => {
    listSuppliers.mockResolvedValue(pageOf([norte]))
    renderPage()

    expect(await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Paginación de proveedores' })).toBeNull()
  })
})

describe('SuppliersPage search bar and reload', () => {
  it('does not query while typing', async () => {
    listSuppliers.mockResolvedValue(pageOf([norte]))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })
    const requests = listSuppliers.mock.calls.length

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por nombre o documento' }),
      'algo',
    )

    expect(listSuppliers).toHaveBeenCalledTimes(requests)
  })

  it('reloads the current query with the same filters', async () => {
    listSuppliers.mockResolvedValue(pageOf([norte]))
    const { user } = renderPage()
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'Activos',
    )
    await screen.findByRole('cell', { name: 'Suplementos Norte SAS' })
    const requests = listSuppliers.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(listSuppliers).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ page: 1, active: true })
  })
})
