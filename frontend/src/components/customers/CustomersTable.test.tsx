import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { buildCompanyCustomer, buildNaturalCustomer } from '../../test-utils/customers'
import type { Customer } from '../../types/customer'

import { CustomersTable } from './CustomersTable'

const RETURN_TO = '/clientes?q=laura&pagina=2'

function DetailProbe() {
  const location = useLocation()
  const state = location.state as { from?: string } | null
  return <p data-testid="detail">{`${location.pathname} from=${state?.from ?? ''}`}</p>
}

function renderTable(customers: Customer[]) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/clientes']}>
      <Routes>
        <Route
          path="/clientes"
          element={<CustomersTable customers={customers} returnTo={RETURN_TO} />}
        />
        <Route path="/clientes/:customerId" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

describe('CustomersTable', () => {
  it('describes the table and its columns', () => {
    renderTable([buildNaturalCustomer()])

    expect(
      screen.getByRole('table', { name: 'Clientes registrados en Intelligent Nutrition' }),
    ).toBeInTheDocument()
    for (const header of ['Cliente', 'Documento', 'Teléfono', 'Estado']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument()
    }
  })

  it('renders one row per customer', () => {
    renderTable([buildNaturalCustomer(), buildCompanyCustomer()])

    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('shows the identity, document, kind and phone of a natural person', () => {
    renderTable([buildNaturalCustomer()])

    const row = screen.getByRole('row', { name: /Laura Pérez/ })
    expect(within(row).getByText('Laura Pérez')).toBeInTheDocument()
    expect(within(row).getByText('laura@correo.com')).toBeInTheDocument()
    expect(within(row).getByText('CC 1049000111')).toBeInTheDocument()
    expect(within(row).getByText('Persona natural')).toBeInTheDocument()
    expect(within(row).getByText('3001112233')).toBeInTheDocument()
  })

  it('shows the NIT and the company label for a business', () => {
    renderTable([buildCompanyCustomer()])

    const row = screen.getByRole('row', { name: /Gimnasio Fuerza SAS/ })
    expect(within(row).getByText('NIT 900123456-7')).toBeInTheDocument()
    expect(within(row).getByText('Empresa')).toBeInTheDocument()
    expect(within(row).queryByText('Persona natural')).not.toBeInTheDocument()
  })

  it('shows the state of each customer and mutes the avatar of an inactive one', () => {
    renderTable([buildNaturalCustomer(), buildCompanyCustomer({ active: false })])

    const active = screen.getByRole('row', { name: /Laura Pérez/ })
    const inactive = screen.getByRole('row', { name: /Gimnasio Fuerza SAS/ })
    expect(within(active).getByText('Activo')).toBeInTheDocument()
    expect(within(inactive).getByText('Inactivo')).toBeInTheDocument()
    expect(within(active).getByText('LP')).not.toHaveClass('ui-avatar--muted')
    expect(within(inactive).getByText('GS')).toHaveClass('ui-avatar--muted')
  })

  it('opens the detail and remembers the list filters to come back', async () => {
    const { user } = renderTable([buildNaturalCustomer()])

    await user.click(screen.getByRole('link', { name: 'Ver detalle de Laura Pérez' }))

    expect(screen.getByTestId('detail')).toHaveTextContent(
      `/clientes/customer-laura from=${RETURN_TO}`,
    )
  })

  it('exposes a single accessible link per customer', () => {
    renderTable([buildNaturalCustomer()])

    expect(screen.getAllByRole('link')).toHaveLength(1)
  })
})
