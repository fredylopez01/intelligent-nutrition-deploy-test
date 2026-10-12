import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { Supplier, SuppliersListResponse } from '../../types/supplier'

import { SuppliersPage } from './SuppliersPage'

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const listSuppliers = vi.mocked(suppliersService.list)
const updateSupplier = vi.mocked(suppliersService.update)

const norte: Supplier = {
  id: 'supplier-1',
  commercialName: 'Suplementos Norte',
  person: {
    documentTypeId: 'doc-nit',
    firstName: null,
    lastName: null,
    businessName: 'Suplementos Norte SAS',
    documentNumber: '900123456',
    documentType: { code: 'NIT', name: 'NIT' },
    email: 'contacto@norte.test',
    phone: '3001112222',
    address: 'Calle 10 # 20-30',
    active: true,
  },
}

function pageOf(data: Supplier[]): SuppliersListResponse {
  return {
    data,
    meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 },
  }
}

async function openEditDialog() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <SuppliersPage />
    </MemoryRouter>,
  )

  await user.click(await screen.findByRole('button', { name: 'Editar Suplementos Norte SAS' }))

  const dialog = screen.getByRole('dialog', { name: 'Editar proveedor' })
  await waitFor(() =>
    expect(within(dialog).getByRole('combobox', { name: 'Tipo de documento' })).toHaveValue(
      'doc-nit',
    ),
  )
  return { user, dialog: within(dialog) }
}

describe('SuppliersPage edit flow', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    listSuppliers.mockResolvedValue(pageOf([norte]))
    vi.mocked(documentTypesService.list).mockResolvedValue([
      { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
    ])
  })

  it('opens the edit dialog with every person field ready to edit', async () => {
    const { dialog } = await openEditDialog()

    await waitFor(() =>
      expect(dialog.getByRole('combobox', { name: 'Tipo de documento' })).toHaveValue('doc-nit'),
    )
    expect(dialog.getByLabelText('Número de documento')).toHaveValue('900123456')
    expect(dialog.getByLabelText('Razón social')).toHaveValue('Suplementos Norte SAS')
    expect(dialog.getByLabelText('Correo electrónico')).toHaveValue('contacto@norte.test')
    expect(dialog.getByLabelText('Nombre comercial')).toHaveValue('Suplementos Norte')
    expect(dialog.getByLabelText('Teléfono')).toHaveValue('3001112222')
    expect(dialog.getByLabelText('Dirección')).toHaveValue('Calle 10 # 20-30')
  })

  it('closes the dialog, confirms the change and reloads the list after saving', async () => {
    updateSupplier.mockResolvedValue({ ...norte, person: { ...norte.person, phone: '3009998888' } })
    const { user, dialog } = await openEditDialog()
    const requestsBeforeSaving = listSuppliers.mock.calls.length

    await user.clear(dialog.getByLabelText('Teléfono'))
    await user.type(dialog.getByLabelText('Teléfono'), '3009998888')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Los cambios se guardaron correctamente.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(listSuppliers.mock.calls.length).toBeGreaterThan(requestsBeforeSaving),
    )
  })

  it('keeps the dialog open with the error when saving fails', async () => {
    updateSupplier.mockRejectedValue(new ApiError('Forbidden', 403))
    const { user, dialog } = await openEditDialog()

    await user.clear(dialog.getByLabelText('Teléfono'))
    await user.type(dialog.getByLabelText('Teléfono'), '3009998888')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'No tienes permiso para editar proveedores.',
    )
    expect(screen.getByRole('dialog', { name: 'Editar proveedor' })).toBeInTheDocument()
    expect(screen.queryByText('Los cambios se guardaron correctamente.')).not.toBeInTheDocument()
  })

  it('closes the dialog without saving when the user cancels', async () => {
    const { user, dialog } = await openEditDialog()

    await user.click(dialog.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(updateSupplier).not.toHaveBeenCalled()
  })
})
