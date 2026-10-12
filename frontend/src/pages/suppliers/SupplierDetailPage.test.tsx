import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { Supplier } from '../../types/supplier'

import { SupplierDetailPage } from './SupplierDetailPage'

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { getById: vi.fn(), update: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: 'SUPERADMIN' } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({
    title,
    backTo,
    backLabel,
    children,
  }: {
    title: string
    backTo?: string
    backLabel?: string
    children: ReactNode
  }) => (
    <main>
      {backTo && <a href={backTo}>{backLabel}</a>}
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const getSupplier = vi.mocked(suppliersService.getById)
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
    documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
    email: 'contacto@norte.test',
    phone: '3001112222',
    address: 'Calle 10 # 20-30',
    active: true,
  },
}

function renderPage(supplierId = 'supplier-1', from?: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={[{ pathname: `/proveedores/${supplierId}`, state: from ? { from } : null }]}
    >
      <Routes>
        <Route path="/proveedores/:supplierId" element={<SupplierDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(documentTypesService.list).mockResolvedValue([
    { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
  ])
  getSupplier.mockResolvedValue(norte)
})

describe('SupplierDetailPage view', () => {
  it('shows the supplier profile and a way back to the list it came from', async () => {
    renderPage('supplier-1', '/proveedores?pagina=2')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suplementos Norte SAS' }),
    ).toBeInTheDocument()
    const profile = within(screen.getByRole('region', { name: 'Suplementos Norte SAS' }))
    expect(profile.getByText('contacto@norte.test')).toBeInTheDocument()
    expect(profile.getByText('Empresa')).toBeInTheDocument()
    expect(profile.getByText('NIT 900123456')).toBeInTheDocument()
    expect(profile.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al listado de proveedores' })).toHaveAttribute(
      'href',
      '/proveedores?pagina=2',
    )
    expect(getSupplier).toHaveBeenCalledWith('supplier-1', 'test-token')
  })

  it('goes back to the supplier list by default', async () => {
    renderPage()

    expect(
      await screen.findByRole('link', { name: 'Volver al listado de proveedores' }),
    ).toHaveAttribute('href', '/proveedores')
  })

  it('tells when the supplier does not exist', async () => {
    getSupplier.mockRejectedValue(new ApiError('Supplier not found', 404))
    renderPage('missing')

    expect(await screen.findByText('Este proveedor no existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute(
      'href',
      '/proveedores',
    )
  })

  it('retries after a loading error', async () => {
    getSupplier.mockRejectedValueOnce(new ApiError('Boom', 500))
    const { user } = renderPage()

    expect(await screen.findByText('No se pudo cargar el proveedor')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Suplementos Norte SAS' }),
    ).toBeInTheDocument()
  })
})

describe('SupplierDetailPage update', () => {
  it('edits the person data and shows the saved values', async () => {
    const updated = { ...norte, person: { ...norte.person, phone: '3009998888' } }
    updateSupplier.mockResolvedValue(updated)
    const { user } = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Suplementos Norte SAS' })

    await user.click(screen.getByRole('button', { name: 'Actualizar información' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toHaveValue('doc-nit'),
    )
    getSupplier.mockResolvedValue(updated)
    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3009998888')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Proveedor actualizado exitosamente.')).toBeInTheDocument()
    expect(updateSupplier).toHaveBeenCalledWith(
      'supplier-1',
      { person: { phone: '3009998888' } },
      'test-token',
    )
    await waitFor(() => expect(getSupplier).toHaveBeenCalledTimes(2))
    const profile = within(screen.getByRole('region', { name: 'Suplementos Norte SAS' }))
    expect(await profile.findByText('3009998888')).toBeInTheDocument()
  })
})
