import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Supplier } from '../../types/supplier'

import { SuppliersTable } from './SuppliersTable'

const suppliers: Supplier[] = [
  {
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
  },
  {
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
  },
]

function renderTable(rows: Supplier[] = suppliers) {
  const onView = vi.fn()
  const onEdit = vi.fn()
  const user = userEvent.setup()
  render(<SuppliersTable suppliers={rows} onView={onView} onEdit={onEdit} />)
  return { user, onView, onEdit }
}

function getRow(name: string) {
  const row = screen.getByRole('cell', { name }).closest('tr')
  if (!row) throw new Error(`No row found for ${name}`)
  return row
}

describe('SuppliersTable', () => {
  it('shows the column headers', () => {
    renderTable()

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual([
      'Proveedor',
      'Nombre comercial',
      'Documento',
      'Teléfono',
      'Correo',
      'Dirección',
      'Estado',
      'Acciones',
    ])
  })

  it('renders one row per supplier with its data and status', () => {
    renderTable()

    expect(screen.getAllByRole('row')).toHaveLength(suppliers.length + 1)

    const norte = within(getRow('Suplementos Norte SAS'))
    expect(norte.getByText('Suplementos Norte')).toBeInTheDocument()
    expect(norte.getByText('NIT 900123456')).toBeInTheDocument()
    expect(norte.getByText('3001112222')).toBeInTheDocument()
    expect(norte.getByText('contacto@norte.test')).toBeInTheDocument()
    expect(norte.getByText('Calle 10 # 20-30')).toBeInTheDocument()
    expect(norte.getByText('Activo')).toBeInTheDocument()

    const sur = within(getRow('Distribuidora Sur'))
    expect(sur.getByText('1234567890')).toBeInTheDocument()
    expect(sur.getByText('Inactivo')).toBeInTheDocument()
  })

  it('replaces missing optional values with an em dash', () => {
    renderTable()

    const sur = within(getRow('Distribuidora Sur'))
    expect(sur.getAllByText('—')).toHaveLength(4)
  })

  it('renders only the header when there are no suppliers', () => {
    renderTable([])

    expect(screen.getAllByRole('row')).toHaveLength(1)
  })

  it('opens the detail view for the selected supplier', async () => {
    const { user, onView, onEdit } = renderTable()

    await user.click(screen.getByRole('button', { name: 'Ver detalle de Suplementos Norte SAS' }))

    expect(onView).toHaveBeenCalledWith(suppliers[0])
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('opens the edit form for the selected supplier', async () => {
    const { user, onView, onEdit } = renderTable()

    await user.click(screen.getByRole('button', { name: 'Editar Distribuidora Sur' }))

    expect(onEdit).toHaveBeenCalledWith(suppliers[1])
    expect(onView).not.toHaveBeenCalled()
  })

  it('shows the full name of a natural person supplier', async () => {
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
    const { user, onEdit } = renderTable([marcela])

    expect(screen.getByRole('cell', { name: 'Marcela Rojas' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Editar Marcela Rojas' }))
    expect(onEdit).toHaveBeenCalledWith(marcela)
  })
})
