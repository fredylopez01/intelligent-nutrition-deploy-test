import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesService } from '../../services/categories.service'
import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { unitsService } from '../../services/units.service'
import { inventoryPage } from '../../test-utils/inventory'
import { CATEGORIES, UNITS, optionsPage } from '../../test-utils/products'
import type { ConsolidatedItem } from '../../types/inventory'

import { ConsolidatedInventoryPage } from './ConsolidatedInventoryPage'

vi.mock('../../services/inventory.service', () => ({
  inventoryService: { consolidated: vi.fn() },
}))

vi.mock('../../services/categories.service', () => ({
  categoriesService: { list: vi.fn() },
}))

vi.mock('../../services/units.service', () => ({
  unitsService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: 'SUPERADMIN' } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const consolidated = vi.mocked(inventoryService.consolidated)

const whey: ConsolidatedItem = {
  product: { id: 'product-whey', name: 'Whey Protein 2 lb', referenceCode: 'WHEY-2LB-001' },
  branchesTotal: 32,
  total: 32,
  branches: [{ branchId: 'branch-centro', branchName: 'Centro', quantity: 32, minimumStock: 5 }],
}

function renderPage(path = '/inventario/consolidado') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsolidatedInventoryPage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(categoriesService.list).mockResolvedValue(optionsPage(CATEGORIES))
  vi.mocked(unitsService.list).mockResolvedValue(optionsPage(UNITS))
  consolidated.mockResolvedValue(inventoryPage([whey]))
})

describe('ConsolidatedInventoryPage', () => {
  it('lists the products with their total in every branch', async () => {
    renderPage()

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
    expect(consolidated).toHaveBeenCalledWith(
      { page: 1, limit: 10, search: undefined, categoryId: undefined },
      'test-token',
    )
  })

  it('searches and filters by category', async () => {
    const { user } = renderPage()
    await screen.findByText('Whey Protein 2 lb')

    await user.selectOptions(screen.getByLabelText('Filtrar por categoría'), 'Proteínas')
    await waitFor(() =>
      expect(consolidated).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: 'cat-protein' }),
        'test-token',
      ),
    )

    await user.type(screen.getByLabelText('Buscar producto por nombre o código'), 'whey{Enter}')
    await waitFor(() =>
      expect(consolidated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'whey', page: 1 }),
        'test-token',
      ),
    )
  })

  it('offers to clear the filters when nothing matches', async () => {
    consolidated.mockResolvedValue(inventoryPage([]))
    const { user } = renderPage('/inventario/consolidado?q=zzz')

    await user.click(await screen.findByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() =>
      expect(consolidated).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: undefined }),
        'test-token',
      ),
    )
  })

  it('explains when no product is in any branch yet', async () => {
    consolidated.mockResolvedValue(inventoryPage([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay productos en las sedes')).toBeInTheDocument()
    expect(
      screen.queryByRole('table', { name: 'Inventario consolidado de todas las sedes' }),
    ).not.toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    consolidated
      .mockRejectedValueOnce(new ApiError('Error', 500))
      .mockResolvedValueOnce(inventoryPage([whey]))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar el inventario consolidado',
    )
    expect(
      screen.queryByRole('table', { name: 'Inventario consolidado de todas las sedes' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Whey Protein 2 lb')).toBeInTheDocument()
  })
})
