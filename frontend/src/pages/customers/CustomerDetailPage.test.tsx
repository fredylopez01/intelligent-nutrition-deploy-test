import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { ApiError } from '../../services/http'
import { buildCompanyCustomer, buildNaturalCustomer } from '../../test-utils/customers'

import { CustomerDetailPage } from './CustomerDetailPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/customers.service', () => ({
  customersService: { getById: vi.fn(), update: vi.fn(), updateStatus: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: auth.role } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({
    title,
    backTo,
    backLabel,
    actions,
    children,
  }: {
    title: string
    backTo?: string
    backLabel?: string
    actions?: ReactNode
    children: ReactNode
  }) => (
    <main>
      {backTo && <a href={backTo}>{backLabel}</a>}
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
}))

const getCustomer = vi.mocked(customersService.getById)
const updateCustomer = vi.mocked(customersService.update)
const updateStatus = vi.mocked(customersService.updateStatus)

const laura = buildNaturalCustomer()

function renderPage(customerId = 'customer-laura', from?: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={[{ pathname: `/clientes/${customerId}`, state: from ? { from } : null }]}
    >
      <Routes>
        <Route path="/clientes/:customerId" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

function field(label: string) {
  return screen.getByLabelText(label)
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  getCustomer.mockResolvedValue(laura)
  updateCustomer.mockResolvedValue(laura)
  updateStatus.mockResolvedValue({ message: 'Customer status updated successfully.' })
})

describe('CustomerDetailPage view', () => {
  it('shows the customer profile and a way back to the list', async () => {
    renderPage('customer-laura', '/clientes?q=laura')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laura Pérez' }),
    ).toBeInTheDocument()
    expect(getCustomer).toHaveBeenCalledWith('customer-laura', 'test-token')
    expect(screen.getByRole('link', { name: 'Volver al listado de clientes' })).toHaveAttribute(
      'href',
      '/clientes?q=laura',
    )
    const profile = screen.getByRole('region', { name: 'Laura Pérez' })
    expect(within(profile).getByText('Persona natural')).toBeInTheDocument()
    expect(within(profile).getByText('CC 1049000111')).toBeInTheDocument()
    expect(within(profile).getByText('Activo')).toBeInTheDocument()
  })

  it('tells when the customer does not exist', async () => {
    getCustomer.mockRejectedValue(new ApiError('Customer not found', 404, {}, 'NOT_FOUND'))
    renderPage('missing')

    expect(await screen.findByText('Este cliente no existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute(
      'href',
      '/clientes',
    )
  })

  it('warns that an inactive customer cannot be used in new sales', async () => {
    getCustomer.mockResolvedValue({ ...laura, active: false })
    renderPage()

    expect(
      await screen.findByText(
        'Este cliente está inactivo: conserva su historial, pero no se puede usar en ventas nuevas.',
      ),
    ).toBeInTheDocument()
  })
})

describe('CustomerDetailPage data', () => {
  it('shows the registered data read only', async () => {
    renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Laura Pérez' })

    expect(field('Tipo de documento')).toHaveValue('Cédula de Ciudadanía')
    expect(field('Número de documento')).toHaveValue('1049000111')
    expect(field('Nombres')).toHaveValue('Laura')
    expect(field('Apellidos')).toHaveValue('Pérez')
    expect(field('Correo electrónico')).toHaveValue('laura@correo.com')
    expect(field('Teléfono')).toHaveValue('3001112233')
    expect(field('Dirección')).toHaveValue('Calle 20 # 10-15, Tunja')
    for (const label of [
      'Tipo de documento',
      'Número de documento',
      'Nombres',
      'Apellidos',
      'Correo electrónico',
      'Teléfono',
      'Dirección',
    ]) {
      expect(field(label)).toHaveAttribute('readonly')
    }
  })

  it('shows the business name of a company', async () => {
    getCustomer.mockResolvedValue(buildCompanyCustomer())
    renderPage('customer-gym')

    expect(await screen.findByLabelText('Razón social')).toHaveValue('Gimnasio Fuerza SAS')
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
  })
})
