import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'

import { CreateSupplierForm } from './CreateSupplierForm'

const mocks = vi.hoisted(() => ({
  token: 'test-token',
  documentTypes: [{ id: 'dt-uuid-1', code: 'CC', name: 'Cédula de Ciudadanía', active: true }],
  docTypesLoading: false,
  docTypesError: false,
  create: vi.fn(),
  onCreated: vi.fn(),
  onCancel: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: mocks.token }),
}))

vi.mock('../../hooks/useDocumentTypes', () => ({
  useDocumentTypes: () => ({
    documentTypes: mocks.documentTypes,
    isLoading: mocks.docTypesLoading,
    error: mocks.docTypesError,
    refetch: vi.fn(),
  }),
}))

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { create: mocks.create },
}))

const validPayload = {
  documentNumber: '900123456',
  businessName: 'Suplementos Colombia SAS',
  email: 'contacto@ejemplo.com',
  phone: '3001234567',
  address: 'Calle 10 # 20-30',
  commercialName: 'Suplementos Colombia',
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'dt-uuid-1')
  await user.type(screen.getByLabelText('Número de documento'), validPayload.documentNumber)
  await user.type(screen.getByLabelText('Nombre o razón social'), validPayload.businessName)
  await user.type(screen.getByLabelText('Correo electrónico'), validPayload.email)
  await user.type(screen.getByLabelText('Teléfono'), validPayload.phone)
  await user.type(screen.getByLabelText('Dirección (opcional)'), validPayload.address)
  await user.type(screen.getByLabelText('Nombre comercial'), validPayload.commercialName)
}

function renderForm() {
  return render(<CreateSupplierForm onCreated={mocks.onCreated} onCancel={mocks.onCancel} />)
}

describe('CreateSupplierForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.documentTypes = [
      { id: 'dt-uuid-1', code: 'CC', name: 'Cédula de Ciudadanía', active: true },
    ]
    mocks.docTypesLoading = false
    mocks.docTypesError = false
    mocks.create.mockResolvedValue({ id: 'supplier-1' })
  })

  it('submits the form and calls onCreated on success', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillForm(user)

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(mocks.create).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'dt-uuid-1',
          documentNumber: validPayload.documentNumber,
          businessName: validPayload.businessName,
          email: validPayload.email,
          phone: validPayload.phone,
          address: validPayload.address,
        },
        commercialName: validPayload.commercialName,
      },
      mocks.token,
    )
    expect(mocks.onCreated).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows required validation errors and does not submit when the form is empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Selecciona un tipo de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el número de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre o razón social')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre comercial')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.onCreated).not.toHaveBeenCalled()
  })

  it('shows the duplicate NIT message when the API responds 409', async () => {
    mocks.create.mockRejectedValue(new ApiError('Conflict', 409, {}, 'ALREADY_SUPPLIER'))
    const user = userEvent.setup()
    renderForm()
    await fillForm(user)

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(
      await screen.findByText('Esta persona ya está registrada como proveedor.'),
    ).toBeInTheDocument()
    expect(mocks.onCreated).not.toHaveBeenCalled()
  })

  it('shows the permission message when the API responds 403', async () => {
    mocks.create.mockRejectedValue(new ApiError('Forbidden', 403))
    const user = userEvent.setup()
    renderForm()
    await fillForm(user)

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(
      await screen.findByText('No tienes permiso para registrar proveedores.'),
    ).toBeInTheDocument()
  })

  it('shows an inline error for an invalid email format', async () => {
    const user = userEvent.setup()
    renderForm()
    await fillForm(user)
    await user.clear(screen.getByLabelText('Correo electrónico'))
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-un-correo')

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
