import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { Supplier } from '../../types/supplier'

import { SuppliersTable } from './SuppliersTable'

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

const sur: Supplier = {
  id: 'supplier-2',
  commercialName: null,
  person: {
    businessName: 'Distribuidora Sur',
    documentNumber: '1234567890',
    documentType: null,
    email: null,
    phone: null,
    address: null,
    active: false,
  },
}

const marcela: Supplier = {
  id: 'supplier-3',
  commercialName: 'Distribuciones Marcela',
  person: {
    firstName: 'Marcela',
    lastName: 'Rojas',
    businessName: null,
    documentNumber: '1049555666',
    documentType: { code: 'CC', name: 'Cédula de Ciudadanía' },
    email: 'marcela@correo.com',
    phone: '3205557788',
    address: 'Calle 15 # 9-30',
    active: true,
  },
}

function renderTable(rows: Supplier[] = [norte, sur]) {
  render(
    <MemoryRouter>
      <SuppliersTable suppliers={rows} returnTo="/proveedores?pagina=2" />
    </MemoryRouter>,
  )
}

function rowOf(name: string) {
  return screen.getByRole('link', { name: `Ver detalle de ${name}` }).closest('tr') as HTMLElement
}

describe('SuppliersTable', () => {
  it('shows the column headers', () => {
    renderTable()

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Proveedor', 'Documento', 'Teléfono', 'Estado', 'Abrir'])
  })

  it('shows the name, commercial name, document, kind, phone and state', () => {
    renderTable()

    const row = within(rowOf('Suplementos Norte SAS'))
    expect(row.getByText('Suplementos Norte SAS')).toBeInTheDocument()
    expect(row.getByText('Suplementos Norte')).toBeInTheDocument()
    expect(row.getByText('NIT 900123456')).toBeInTheDocument()
    expect(row.getByText('Empresa')).toBeInTheDocument()
    expect(row.getByText('3001112222')).toBeInTheDocument()
    expect(row.getByText('Activo')).toBeInTheDocument()
  })

  it('fills the missing data with a dash', () => {
    renderTable()

    const row = within(rowOf('Distribuidora Sur'))
    expect(row.getAllByText('—')).toHaveLength(2)
    expect(row.getByText('1234567890')).toBeInTheDocument()
    expect(row.getByText('Inactivo')).toBeInTheDocument()
  })

  it('links each supplier to its detail page and remembers the list', () => {
    renderTable()

    expect(
      screen.getByRole('link', { name: 'Ver detalle de Suplementos Norte SAS' }),
    ).toHaveAttribute('href', '/proveedores/supplier-1')
  })

  it('shows the names of a natural person supplier', () => {
    renderTable([marcela])

    const row = within(rowOf('Marcela Rojas'))
    expect(row.getByText('Persona natural')).toBeInTheDocument()
    expect(row.getByText('CC 1049555666')).toBeInTheDocument()
  })
})
