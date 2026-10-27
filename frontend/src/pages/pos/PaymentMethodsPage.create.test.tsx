import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { paymentMethodsService } from '../../services/paymentMethods.service'
import { CASH, NEQUI, OTHER, paymentMethodsPage } from '../../test-utils/paymentMethods'

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

const createMethod = vi.mocked(paymentMethodsService.create)

describe('PaymentMethodsPage create', () => {
  it('registers a payment method and goes back to the list', async () => {
    createMethod.mockResolvedValue({
      id: 'pm-davi',
      code: 'DAVIPLATA',
      name: 'Daviplata',
      active: true,
    })
    const { user } = renderPage()
    await screen.findByText('Efectivo')
    expect(listMethods).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Registrar método' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Registrar método de pago' }))
    await user.type(dialog.getByLabelText('Código'), 'daviplata')
    await user.type(dialog.getByLabelText('Nombre'), 'Daviplata')
    await user.click(dialog.getByRole('button', { name: 'Registrar método' }))

    expect(
      await screen.findByText(
        'El método Daviplata (DAVIPLATA) quedó registrado y ya se puede usar en el punto de venta.',
      ),
    ).toBeInTheDocument()
    expect(createMethod).toHaveBeenCalledWith(
      { code: 'DAVIPLATA', name: 'Daviplata' },
      'test-token',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(listMethods).toHaveBeenCalledTimes(2))
  })

  it('offers the register action in the empty state', async () => {
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    const { user } = renderPage()
    const emptyState = (await screen.findByText('Todavía no hay métodos de pago')).parentElement
    if (!emptyState) throw new Error('Empty state not rendered')

    await user.click(within(emptyState).getByRole('button', { name: 'Registrar método' }))

    expect(screen.getByRole('dialog', { name: 'Registrar método de pago' })).toBeInTheDocument()
  })

  it('closes the form without saving when it is cancelled', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Registrar método' }))
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createMethod).not.toHaveBeenCalled()
  })

  it('hides the register action in the empty state from the branch leader', async () => {
    auth.role = 'BRANCH_LEADER'
    listMethods.mockResolvedValue(paymentMethodsPage([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay métodos de pago')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registrar método' })).not.toBeInTheDocument()
  })
})
