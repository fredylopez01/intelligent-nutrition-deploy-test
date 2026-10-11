import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { documentTypesService } from '../../services/document-types.service'
import { personsService } from '../../services/persons.service'
import {
  DOCUMENT_TYPES,
  buildCompanyCustomer,
  buildNaturalCustomer,
} from '../../test-utils/customers'
import { openNewForm, searchResponse } from '../../test-utils/persons'
import type { Customer } from '../../types/customer'

import { CustomersPage } from './CustomersPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/customers.service', () => ({
  customersService: { list: vi.fn(), create: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../services/persons.service', () => ({
  personsService: { search: vi.fn() },
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

const listCustomers = vi.mocked(customersService.list)
const createCustomer = vi.mocked(customersService.create)
const listDocumentTypes = vi.mocked(documentTypesService.list)

const laura = buildNaturalCustomer()
const gym = buildCompanyCustomer()

function page(customers: Customer[], meta: Partial<{ page: number; totalPages: number }> = {}) {
  return {
    data: customers,
    meta: {
      page: meta.page ?? 1,
      limit: 10,
      total: customers.length,
      totalPages: meta.totalPages ?? (customers.length > 0 ? 1 : 0),
    },
  }
}

function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>
}

function renderPage(path = '/clientes') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/clientes"
          element={
            <>
              <CustomersPage />
              <LocationProbe />
            </>
          }
        />
        <Route path="/clientes/:customerId" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

function lastListCall() {
  return listCustomers.mock.calls.at(-1)?.[0]
}

async function waitForRows() {
  return screen.findAllByRole('row')
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listCustomers.mockResolvedValue(page([gym, laura]))
  listDocumentTypes.mockResolvedValue(DOCUMENT_TYPES)
  vi.mocked(personsService.search).mockResolvedValue(searchResponse([]))
})

describe('CustomersPage table', () => {
  it('lists the customers with their document, type, phone and state', async () => {
    renderPage()

    await waitForRows()
    const row = screen.getByRole('row', { name: /Laura Pérez/ })
    expect(within(row).getByText('laura@correo.com')).toBeInTheDocument()
    expect(within(row).getByText('CC 1049000111')).toBeInTheDocument()
    expect(within(row).getByText('Persona natural')).toBeInTheDocument()
    expect(within(row).getByText('3001112233')).toBeInTheDocument()
    expect(
      within(screen.getByRole('row', { name: /Gimnasio/ })).getByText('Empresa'),
    ).toBeInTheDocument()
    expect(listCustomers).toHaveBeenCalledWith({ page: 1, limit: 10 }, 'test-token')
    expect(
      screen.getByText('2 clientes. Abre uno para ver y actualizar sus datos.'),
    ).toBeInTheDocument()
  })

  it('opens the customer detail from the table', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('link', { name: 'Ver detalle de Laura Pérez' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/clientes/customer-laura')
  })

  it('shows the error and retries', async () => {
    listCustomers.mockRejectedValueOnce(new Error('Network down'))
    const { user } = renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los clientes. Intenta de nuevo.',
    )
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Laura Pérez')).toBeInTheDocument()
  })

  it('invites to register the first customer when there are none', async () => {
    listCustomers.mockResolvedValue(page([]))
    renderPage()

    expect(await screen.findByText('Todavía no hay clientes registrados')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Registrar cliente' })).toHaveLength(2)
  })
})

describe('CustomersPage search and filters', () => {
  it('searches when Enter is pressed, not on every key', async () => {
    const { user } = renderPage()
    await waitForRows()
    const requests = listCustomers.mock.calls.length

    await user.type(screen.getByRole('searchbox'), '  gimnasio ')
    expect(listCustomers).toHaveBeenCalledTimes(requests)

    await user.keyboard('{Enter}')

    await waitFor(() => expect(lastListCall()).toEqual({ page: 1, limit: 10, search: 'gimnasio' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/clientes?q=gimnasio')
  })

  it('removes the search when the box is emptied and Enter is pressed', async () => {
    const { user } = renderPage('/clientes?q=laura')
    await waitForRows()

    await user.clear(screen.getByRole('searchbox'))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(lastListCall()).toEqual({ page: 1, limit: 10 }))
  })

  it('has no magnifier or reload buttons', async () => {
    renderPage()
    await waitForRows()

    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recargar' })).not.toBeInTheDocument()
  })

  it('does not search with a single character', async () => {
    const { user } = renderPage()
    await waitForRows()
    const requests = listCustomers.mock.calls.length

    await user.type(screen.getByRole('searchbox'), 'g{Enter}')

    expect(
      await screen.findByText('Escribe al menos 2 caracteres para buscar.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveAttribute('aria-invalid', 'true')
    expect(listCustomers).toHaveBeenCalledTimes(requests)
  })

  it('filters by state and goes back to the first page', async () => {
    listCustomers.mockResolvedValue(page([laura], { page: 2, totalPages: 3 }))
    const { user } = renderPage('/clientes?pagina=2')
    await waitForRows()

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filtrar por estado' }),
      'inactivos',
    )

    await waitFor(() => expect(lastListCall()).toEqual({ page: 1, limit: 10, active: false }))
  })

  it('offers to clear the filters when nothing matches', async () => {
    listCustomers.mockResolvedValue(page([]))
    const { user } = renderPage('/clientes?q=zzz&estado=inactivos')

    expect(await screen.findByText('Ningún cliente coincide con los filtros')).toBeInTheDocument()
    listCustomers.mockResolvedValue(page([laura]))
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    await waitFor(() => expect(lastListCall()).toEqual({ page: 1, limit: 10 }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toHaveValue('todos')
  })

  it('moves between pages', async () => {
    listCustomers.mockResolvedValue(page([laura], { page: 1, totalPages: 3 }))
    const { user } = renderPage()
    await waitForRows()

    const pagination = screen.getByRole('navigation', { name: 'Paginación de clientes' })
    expect(within(pagination).getByText('Página 1 de 3')).toBeInTheDocument()
    expect(within(pagination).getByRole('button', { name: 'Anterior' })).toBeDisabled()

    await user.click(within(pagination).getByRole('button', { name: 'Siguiente' }))

    await waitFor(() => expect(lastListCall()).toEqual({ page: 2, limit: 10 }))
  })
})

describe('CustomersPage register', () => {
  it('confirms the new customer and refreshes the list', async () => {
    createCustomer.mockResolvedValue(gym)
    const { user } = renderPage()
    await waitForRows()
    const requests = listCustomers.mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Registrar cliente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Registrar cliente' })
    await openNewForm(user, 'gimnasio fuerza')
    await user.click(within(dialog).getByRole('radio', { name: /Empresa/ }))
    await waitFor(() =>
      expect(within(dialog).getByRole('combobox', { name: 'Tipo de documento' })).toHaveValue(
        'doc-nit',
      ),
    )
    await user.type(within(dialog).getByLabelText('Número de documento'), '900123456-7')
    await user.type(within(dialog).getByLabelText('Razón social'), 'Gimnasio Fuerza SAS')
    await user.type(within(dialog).getByLabelText('Correo electrónico'), 'gym@correo.com')
    await user.type(within(dialog).getByLabelText('Teléfono'), '6087401122')
    await user.type(within(dialog).getByLabelText('Dirección'), 'Av. Norte # 45-10, Tunja')
    await user.click(within(dialog).getByRole('button', { name: 'Registrar cliente' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Cliente creado exitosamente.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(listCustomers.mock.calls.length).toBeGreaterThan(requests))
  })
})

describe('CustomersPage state', () => {
  it.each(['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT'])(
    'only shows the state as information to %s',
    async (role) => {
      auth.role = role
      listCustomers.mockResolvedValue(page([gym, { ...laura, active: false }]))
      renderPage()
      await waitForRows()

      expect(
        within(screen.getByRole('row', { name: /Gimnasio/ })).getByText('Activo'),
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('row', { name: /Laura Pérez/ })).getByText('Inactivo'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Desactivar|Activar/ })).not.toBeInTheDocument()
    },
  )
})
