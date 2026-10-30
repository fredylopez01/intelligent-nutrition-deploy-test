import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import { CASH, NEQUI, OTHER, paymentMethodsPage } from '../../test-utils/paymentMethods'
import type { PaymentMethodsListParams } from '../../types/paymentMethod'

import { PaymentMethodsPage } from './PaymentMethodsPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/paymentMethods.service', () => ({
  paymentMethodsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
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

const listMethods = vi.mocked(paymentMethodsService.list)

function lastListParams(): PaymentMethodsListParams {
  const call = listMethods.mock.lastCall
  if (!call) throw new Error('The payment methods list was never requested')
  return call[0]
}

function renderPage(path = '/pos/metodos-pago') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentMethodsPage />
    </MemoryRouter>,
  )
  return { user }
}

function searchBox() {
  return screen.getByRole('searchbox', { name: 'Buscar por código o nombre' })
}

function statusFilter() {
  return screen.getByLabelText('Filtrar por estado')
}

function pendingRequest() {
  return new Promise<never>(() => {})
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listMethods.mockResolvedValue(paymentMethodsPage([CASH, NEQUI, OTHER]))
})

describe('PaymentMethodsPage', () => {
  it('lists the code, name and state of each payment method', async () => {
    renderPage()

    const row = (await screen.findByText('Efectivo')).closest('tr') as HTMLElement
    expect(within(row).getAllByText('CASH')).not.toHaveLength(0)
    expect(within(row).getByText('Activo')).toBeInTheDocument()
    const other = screen.getByText('Otro').closest('tr') as HTMLElement
    expect(within(other).getByText('Inactivo')).toBeInTheDocument()
    expect(lastListParams()).toEqual({ page: 1, limit: 10, search: undefined, active: undefined })
  })

  it('searches by code or name and filters by state', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), 'neq')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'neq' }))
    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactivos')

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ page: 1, search: 'neq', active: false }),
    )
  })

  it('offers to clear the filters when nothing matches', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    const { user } = renderPage('/pos/metodos-pago?q=zzz&estado=activos')
    expect(
      await screen.findByText('Ningún método de pago coincide con los filtros'),
    ).toBeInTheDocument()

    listMethods.mockResolvedValue(paymentMethodsPage([CASH]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Efectivo')).toBeInTheDocument()
    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ search: undefined, active: undefined }),
    )
  })

  it('explains why the list matters when there are no payment methods', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay métodos de pago')).toBeInTheDocument()
    expect(
      screen.getByText('Sin métodos de pago activos el punto de venta no puede registrar ventas.'),
    ).toBeInTheDocument()
  })

  it('shows the error and retries the list', async () => {
    listMethods.mockRejectedValueOnce(new ApiError('Boom', 500, {}, 'INTERNAL'))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los métodos de pago. Intenta de nuevo.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Efectivo')).toBeInTheDocument()
  })

  it('moves through the pages', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([CASH], { total: 15, totalPages: 2 }))
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
  })

  it.each(['BRANCH_LEADER', 'BRANCH_ASSISTANT'])(
    'lets the %s consult the list without management actions',
    async (role) => {
      auth.role = role
      renderPage()
      await screen.findByText('Efectivo')

      expect(screen.queryByRole('button', { name: 'Registrar método' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Acciones para/ })).not.toBeInTheDocument()
    },
  )
})

describe('PaymentMethodsPage loading and reload', () => {
  it('shows the skeleton while the first load is pending', () => {
    listMethods.mockReturnValue(pendingRequest())
    renderPage()

    expect(screen.getByText('Cargando métodos de pago...')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cargando...' })).toBeDisabled()
  })

  it('reloads the list keeping the current filters', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')
    await user.type(searchBox(), 'neq')
    await user.click(screen.getByRole('button', { name: 'Buscar' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'neq' }))
    await screen.findByText('Efectivo')
    const requests = listMethods.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Recargar' }))

    await waitFor(() => expect(listMethods).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ page: 1, search: 'neq' })
  })
})

describe('PaymentMethodsPage search', () => {
  it('does not query while typing', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')
    const requests = listMethods.mock.calls.length

    await user.type(searchBox(), 'algo')

    expect(listMethods).toHaveBeenCalledTimes(requests)
  })

  it('asks for two characters before searching', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')
    const requests = listMethods.mock.calls.length

    await user.type(searchBox(), 'n{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Escribe al menos 2 caracteres para buscar.',
    )
    expect(listMethods).toHaveBeenCalledTimes(requests)
  })

  it('trims the term before searching', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.type(searchBox(), '  neq  {Enter}')

    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'neq', page: 1 }))
  })

  it('ignores a search made only of spaces', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.type(searchBox(), '   {Enter}')

    expect(lastListParams().search).toBeUndefined()
  })

  it('asks the server again when the same search is submitted', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')
    await user.type(searchBox(), 'neq{Enter}')
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'neq' }))
    await screen.findByText('Efectivo')
    const requests = listMethods.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Buscar' }))

    await waitFor(() => expect(listMethods).toHaveBeenCalledTimes(requests + 1))
    expect(lastListParams()).toMatchObject({ page: 1, search: 'neq' })
  })
})

describe('PaymentMethodsPage status filter', () => {
  it.each<[string, boolean]>([
    ['Activos', true],
    ['Inactivos', false],
  ])('applies the "%s" status filter', async (label, active) => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.selectOptions(statusFilter(), label)

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, active }))
  })

  it('removes the status filter when going back to every state', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.selectOptions(statusFilter(), 'Activos')
    await waitFor(() => expect(lastListParams()).toMatchObject({ active: true }))
    await user.selectOptions(statusFilter(), 'Todos los estados')

    await waitFor(() => expect(lastListParams().active).toBeUndefined())
  })
})

describe('PaymentMethodsPage pagination', () => {
  it('hides the pagination controls when there is a single page', async () => {
    renderPage()
    await screen.findByText('Efectivo')

    expect(screen.queryByRole('navigation', { name: 'Paginación de métodos de pago' })).toBeNull()
  })

  it('summarises the visible rows and the current page', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([CASH], { total: 30, totalPages: 3 }))
    renderPage()

    expect(await screen.findByText('Mostrando 1–10 de 30')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Página 1 de 3', current: 'page' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('changes the page size and requests the first page again', async () => {
    listMethods.mockImplementation((params) => {
      const limit = params.limit ?? 10
      return Promise.resolve(
        paymentMethodsPage([CASH], {
          page: params.page ?? 1,
          total: 30,
          totalPages: Math.ceil(30 / limit),
        }),
      )
    })
    const { user } = renderPage('/pos/metodos-pago?pagina=2')
    await screen.findByRole('button', { name: 'Página 2 de 3', current: 'page' })

    await user.selectOptions(screen.getByLabelText('Filas por página'), '20')

    expect(await screen.findByText('Mostrando 1–20 de 30')).toBeInTheDocument()
    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, limit: 20 }))
  })

  it('goes back to the first page when the status filter changes', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([CASH], { total: 15, totalPages: 2 }))
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))

    await user.selectOptions(statusFilter(), 'Inactivos')

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 1, active: false }))
  })
})

describe('PaymentMethodsPage empty states', () => {
  it('does not offer to clear filters when there are no filters', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay métodos de pago')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
  })

  it('offers to clear the filters when only the status filter is applied', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    renderPage('/pos/metodos-pago?estado=inactivos')

    expect(
      await screen.findByText('Ningún método de pago coincide con los filtros'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument()
  })

  it('clears the filters and goes back to the first page from a later page', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    const { user } = renderPage('/pos/metodos-pago?q=zzz&estado=activos&pagina=3')
    await screen.findByText('Ningún método de pago coincide con los filtros')
    expect(lastListParams()).toMatchObject({ page: 3, search: 'zzz', active: true })
    listMethods.mockResolvedValue(paymentMethodsPage([CASH]))

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(await screen.findByText('Efectivo')).toBeInTheDocument()
    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ page: 1, search: undefined, active: undefined }),
    )
    expect(statusFilter()).toHaveValue('todos')
    expect(searchBox()).toHaveValue('')
  })
})

describe('PaymentMethodsPage permissions', () => {
  it('lets the SUPERADMIN manage the payment methods', async () => {
    renderPage()
    await screen.findByText('Efectivo')

    expect(screen.getByRole('button', { name: 'Registrar método' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Acciones para Efectivo' })).toBeInTheDocument()
  })
})
