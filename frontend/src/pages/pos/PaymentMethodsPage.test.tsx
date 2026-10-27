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
