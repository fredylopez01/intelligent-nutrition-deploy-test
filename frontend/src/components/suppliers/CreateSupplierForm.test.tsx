import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { buildPerson, openNewForm, searchPerson, searchResponse } from '../../test-utils/persons'

import { CreateSupplierForm } from './CreateSupplierForm'

const mocks = vi.hoisted(() => ({
  token: 'test-token',
  documentTypes: [{ id: 'dt-uuid-1', code: 'CC', name: 'Cédula de Ciudadanía', active: true }],
  docTypesLoading: false,
  docTypesError: false,
  create: vi.fn(),
  search: vi.fn(),
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

vi.mock('../../services/persons.service', () => ({
  personsService: { search: mocks.search },
}))

const validPayload = {
  documentNumber: '1049123456',
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
  await user.type(screen.getByLabelText('Dirección'), validPayload.address)
  await user.type(screen.getByLabelText('Nombre comercial'), validPayload.commercialName)
}

function renderForm() {
  return render(
    <MemoryRouter>
      <CreateSupplierForm onCreated={mocks.onCreated} onCancel={mocks.onCancel} />
    </MemoryRouter>,
  )
}

async function renderNewForm(user: ReturnType<typeof userEvent.setup>) {
  renderForm()
  await openNewForm(user)
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
    mocks.search.mockResolvedValue(searchResponse([]))
  })

  it('submits the form and calls onCreated on success', async () => {
    const user = userEvent.setup()
    await renderNewForm(user)
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
    await renderNewForm(user)

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Selecciona un tipo de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el número de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre o razón social')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre comercial')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.onCreated).not.toHaveBeenCalled()
  })

  it('shows the duplicate NIT message when the API responds 409', async () => {
    mocks.create.mockRejectedValue(new ApiError('Conflict', 409, {}, 'ALREADY_SUPPLIER'))
    const user = userEvent.setup()
    await renderNewForm(user)
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
    await renderNewForm(user)
    await fillForm(user)

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(
      await screen.findByText('No tienes permiso para registrar proveedores.'),
    ).toBeInTheDocument()
  })

  it('shows an inline error for an invalid email format', async () => {
    const user = userEvent.setup()
    await renderNewForm(user)
    await fillForm(user)
    await user.clear(screen.getByLabelText('Correo electrónico'))
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-un-correo')

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('requires the address and a phone with only digits', async () => {
    const user = userEvent.setup()
    await renderNewForm(user)
    await fillForm(user)
    await user.clear(screen.getByLabelText('Dirección'))
    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '300 123 4567')

    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Ingresa la dirección')).toBeInTheDocument()
    expect(
      screen.getByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('starts by searching the person before showing the form', () => {
    renderForm()

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre comercial')).not.toBeInTheDocument()
  })

  it('registers an existing person with its id and the commercial name', async () => {
    const gym = buildPerson({
      id: 'person-gym',
      documentTypeId: 'dt-uuid-1',
      documentNumber: '900123456-7',
      firstName: null,
      lastName: null,
      businessName: 'Gimnasio Fuerza SAS',
      relationships: { hasUserAccount: false, isCustomer: true, isSupplier: false },
    })
    mocks.search.mockResolvedValue(searchResponse([gym]))
    const user = userEvent.setup()
    renderForm()

    await searchPerson(user, 'gimnasio')
    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar a Gimnasio Fuerza SAS como proveedor',
      }),
    )
    const summary = screen.getByRole('region', { name: 'Persona seleccionada' })
    expect(within(summary).getByText('Cliente')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Gimnasio Fuerza SAS')
    await user.clear(screen.getByLabelText('Nombre comercial'))
    await user.type(screen.getByLabelText('Nombre comercial'), '  Fuerza Suplementos ')
    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(mocks.create).toHaveBeenCalledWith(
      { personId: 'person-gym', commercialName: 'Fuerza Suplementos' },
      mocks.token,
    )
    expect(mocks.onCreated).toHaveBeenCalledTimes(1)
  })

  it('asks for the commercial name of an existing person', async () => {
    mocks.search.mockResolvedValue(searchResponse([buildPerson({ documentTypeId: 'dt-uuid-1' })]))
    const user = userEvent.setup()
    renderForm()

    await searchPerson(user, 'laura')
    await user.click(await screen.findByRole('button', { name: /Registrar a Laura Pérez/ }))
    await user.clear(screen.getByLabelText('Nombre comercial'))
    await user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))

    expect(await screen.findByText('Ingresa el nombre comercial')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
