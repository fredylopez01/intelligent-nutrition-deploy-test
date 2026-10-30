import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { productsService } from '../../services/products.service'
import { purchasesService } from '../../services/purchases.service'
import { suppliersService } from '../../services/suppliers.service'
import { buildPurchase, buildPurchaseSummary } from '../../test-utils/purchases'
import type { PurchaseSummary, PurchasesListParams } from '../../types/purchase'

import { PurchasesPage } from './PurchasesPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/purchases.service', () => ({
  purchasesService: { list: vi.fn(), get: vi.fn(), create: vi.fn(), receive: vi.fn() },
}))

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { list: vi.fn() },
}))

vi.mock('../../services/products.service', () => ({
  productsService: { list: vi.fn() },
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

const list = vi.mocked(purchasesService.list)
const get = vi.mocked(purchasesService.get)

const pending = buildPurchaseSummary()
const received = buildPurchaseSummary({
  id: 'purchase-2',
  purchaseNumber: 'C-20261025-0001',
  status: 'FULLY_RECEIVED',
  supplier: { id: 'supplier-2', commercialName: null, businessName: 'Laboratorios del Valle SAS' },
  itemsCount: 1,
})

function page(data: PurchaseSummary[]) {
  return { data, meta: { page: 1, limit: 20, total: data.length, totalPages: data.length ? 1 : 0 } }
}

function lastParams(): PurchasesListParams {
  const call = list.mock.lastCall
  if (!call) throw new Error('The purchases were never requested')
  return call[0]
}

function renderPage(path = '/proveedores/compras') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <PurchasesPage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  list.mockResolvedValue(page([pending, received]))
  get.mockResolvedValue(buildPurchase())
  vi.mocked(suppliersService.list).mockResolvedValue({
    data: [
      {
        id: 'supplier-1',
        commercialName: 'Nutri Andina',
        person: {
          businessName: 'Nutri Andina SAS',
          documentNumber: '900',
          documentType: null,
          email: null,
          phone: null,
          address: null,
          active: true,
        },
      },
    ],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  })
  vi.mocked(productsService.list).mockResolvedValue({
    data: [],
    meta: { page: 1, limit: 6, total: 0, totalPages: 0 },
  })
})

describe('PurchasesPage', () => {
  it('lists the purchases with supplier, total and status', async () => {
    renderPage()

    const table = await screen.findByRole('table', {
      name: 'Órdenes de compra, de la más reciente a la más antigua',
    })
    for (const header of ['Compra', 'Proveedor', 'Total', 'Estado']) {
      expect(within(table).getByRole('columnheader', { name: header })).toBeInTheDocument()
    }

    const row = (await screen.findByText('C-20261025-0001')).closest('tr') as HTMLElement
    expect(within(row).getByText('Laboratorios del Valle SAS')).toBeInTheDocument()
    expect(within(row).getByText('Recibida')).toBeInTheDocument()
    const pendingRow = screen.getByText('C-20261026-0001').closest('tr') as HTMLElement
    expect(within(pendingRow).getByText('Pendiente')).toBeInTheDocument()
    expect(within(pendingRow).getByText(/2 productos/)).toBeInTheDocument()
  })

  it('searches by number and filters by supplier, status and dates', async () => {
    const { user } = renderPage()
    await screen.findByText('C-20261026-0001')

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar por número de compra' }),
      'C-2026',
    )
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por proveedor'), 'supplier-1')
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'PARTIALLY_RECEIVED')
    await user.type(screen.getByLabelText('Desde'), '2026-10-01')

    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        search: 'C-2026',
        supplierId: 'supplier-1',
        status: 'PARTIALLY_RECEIVED',
        from: '2026-10-01',
      }),
    )
  })

  it('moves to the next page when paginating', async () => {
    list.mockResolvedValue({
      data: [pending, received],
      meta: { page: 1, limit: 20, total: 45, totalPages: 3 },
    })
    const { user } = renderPage()

    await screen.findByText('C-20261026-0001')
    expect(lastParams().page).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await waitFor(() => expect(lastParams().page).toBe(2))
  })

  it('explains when no purchase matches the filters', async () => {
    list.mockResolvedValue(page([]))
    const { user } = renderPage()

    expect(await screen.findByText('Todavía no hay órdenes de compra')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'FULLY_RECEIVED')

    expect(await screen.findByText('Ninguna compra coincide con los filtros')).toBeInTheDocument()
  })

  it('opens the detail with the receipt progress', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la compra C-20261026-0001' }))

    const dialog = within(await screen.findByRole('dialog', { name: 'Compra C-20261026-0001' }))
    expect(await dialog.findByText('5 / 20')).toBeInTheDocument()
    expect(dialog.getByLabelText('Recibido 5 de 35')).toBeInTheDocument()
  })

  it('lets the superadmin register the receipt from the detail', async () => {
    vi.mocked(purchasesService.receive).mockResolvedValue(
      buildPurchase({ status: 'FULLY_RECEIVED' }),
    )
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la compra C-20261026-0001' }))
    await user.click(await screen.findByRole('button', { name: 'Registrar recepción' }))
    await user.type(screen.getByLabelText('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
    await user.type(screen.getByLabelText('Vencimiento de Creatina 300 g, lote 1'), '2027-06-30')
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))

    expect(
      await screen.findByText(/quedó recibida completa y sus unidades entraron al stock general/),
    ).toBeInTheDocument()
  })

  it('explains the partial receipt and refreshes the list', async () => {
    vi.mocked(purchasesService.receive).mockResolvedValue(
      buildPurchase({ status: 'PARTIALLY_RECEIVED' }),
    )
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la compra C-20261026-0001' }))
    await user.click(await screen.findByRole('button', { name: 'Registrar recepción' }))
    await user.type(screen.getByLabelText('Vencimiento de Whey Protein 2 lb, lote 1'), '2027-06-30')
    await user.type(screen.getByLabelText('Vencimiento de Creatina 300 g, lote 1'), '2027-06-30')
    await user.click(screen.getByRole('button', { name: 'Confirmar recepción' }))

    expect(
      await screen.findByText(
        'Recepción registrada: la compra C-20261026-0001 sigue pendiente de las unidades que faltan.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('keeps the receipt with the superadmin', async () => {
    auth.role = 'BRANCH_LEADER'
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Ver la compra C-20261026-0001' }))

    expect(await screen.findByText(/La recepción la confirma el superadmin/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar recepción' })).not.toBeInTheDocument()
  })

  it('opens the purchase order form', async () => {
    const { user } = renderPage()
    await screen.findByText('C-20261026-0001')

    await user.click(screen.getByRole('button', { name: 'Registrar orden de compra' }))

    expect(screen.getByRole('dialog', { name: 'Registrar orden de compra' })).toBeInTheDocument()
  })

  it('explains an empty list and shows the error state', async () => {
    list.mockResolvedValueOnce(page([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay órdenes de compra')).toBeInTheDocument()
  })

  it('retries after an error', async () => {
    list.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderPage()

    expect(
      await screen.findByText('No fue posible cargar las compras. Intenta de nuevo.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('C-20261026-0001')).toBeInTheDocument()
  })
})
