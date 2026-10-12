import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { personsService } from '../../services/persons.service'
import { suppliersService } from '../../services/suppliers.service'
import { buildPerson, searchPerson, searchResponse } from '../../test-utils/persons'

import { CreateSupplierForm } from './CreateSupplierForm'

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { create: vi.fn() },
}))

vi.mock('../../services/persons.service', () => ({
  personsService: { search: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createSupplier = vi.mocked(suppliersService.create)
const searchPersons = vi.mocked(personsService.search)

const DOCUMENT_TYPES = [
  { id: 'doc-cc', code: 'CC', name: 'Cédula de Ciudadanía', active: true },
  { id: 'doc-ce', code: 'CE', name: 'Cédula de Extranjería', active: true },
  { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
  { id: 'doc-pas', code: 'PAS', name: 'Pasaporte', active: true },
]

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <CreateSupplierForm onCreated={onCreated} onCancel={onCancel} />
    </MemoryRouter>,
  )
  return { user, onCreated, onCancel }
}

function documentTypeSelect() {
  return screen.getByRole('combobox', { name: 'Tipo de documento' })
}

function optionLabels() {
  return within(documentTypeSelect())
    .getAllByRole('option')
    .filter((option) => (option as HTMLOptionElement).value !== '')
    .map((option) => option.textContent)
}

async function startFromScratch(user: ReturnType<typeof userEvent.setup>, term = 'proveedor') {
  await searchPerson(user, term)
  await user.click(await screen.findByRole('button', { name: 'Crear desde cero' }))
  await waitFor(() => expect(optionLabels().length).toBeGreaterThan(0))
}

async function chooseKind(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await startFromScratch(user)
  await user.click(screen.getByRole('radio', { name: label }))
  await waitFor(() => expect(optionLabels().length).toBeGreaterThan(0))
}

async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Correo electrónico'), 'Contacto@Ejemplo.com')
  await user.type(screen.getByLabelText('Teléfono'), '3001234567')
  await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30')
  await user.type(screen.getByLabelText('Nombre comercial'), ' Suplementos Colombia ')
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Registrar proveedor' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(documentTypesService.list).mockResolvedValue(DOCUMENT_TYPES)
  searchPersons.mockResolvedValue(searchResponse([]))
  createSupplier.mockResolvedValue({ id: 'supplier-1' } as never)
})

describe('CreateSupplierForm flow', () => {
  it('starts by searching the person, without the type selector', () => {
    renderForm()

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Número de documento')).not.toBeInTheDocument()
  })

  it('offers natural person and company after creating from scratch', async () => {
    const { user } = renderForm()

    await startFromScratch(user)

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(screen.getByRole('radio', { name: /Persona natural/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Empresa/ })).not.toBeChecked()
    expect(screen.queryByRole('searchbox', { name: 'Buscar persona' })).not.toBeInTheDocument()
  })

  it('shows NIT and business name for a company', async () => {
    const { user } = renderForm()

    await chooseKind(user, /Empresa/)

    expect(optionLabels()).toEqual(['Número de Identificación Tributaria'])
    expect(documentTypeSelect()).toHaveValue('doc-nit')
    expect(screen.getByLabelText('Razón social')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
  })

  it('shows personal documents and names for a natural person', async () => {
    const { user } = renderForm()

    await chooseKind(user, /Persona natural/)

    expect(optionLabels()).toEqual(['Cédula de Ciudadanía', 'Cédula de Extranjería', 'Pasaporte'])
    expect(screen.getByLabelText('Nombres')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellidos')).toBeInTheDocument()
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument()
  })

  it('keeps the typed contact data when the type changes', async () => {
    const { user } = renderForm()
    await startFromScratch(user)

    await user.type(screen.getByLabelText('Teléfono'), '3001234567')
    await user.click(screen.getByRole('radio', { name: /Empresa/ }))

    expect(screen.getByLabelText('Teléfono')).toHaveValue('3001234567')
    expect(documentTypeSelect()).toHaveValue('doc-nit')
  })

  it('goes back to the search', async () => {
    const { user } = renderForm()
    await startFromScratch(user)

    await user.click(screen.getByRole('button', { name: '← Volver a buscar' }))

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })
})

describe('CreateSupplierForm existing person', () => {
  const gym = buildPerson({
    id: 'person-gym',
    documentTypeId: 'doc-nit',
    documentNumber: '900123456-7',
    firstName: null,
    lastName: null,
    businessName: 'Gimnasio Fuerza SAS',
    relationships: { hasUserAccount: false, isCustomer: true, isSupplier: false },
  })

  async function selectGym(user: ReturnType<typeof userEvent.setup>) {
    searchPersons.mockResolvedValue(searchResponse([gym]))
    await searchPerson(user, 'gimnasio')
    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar a Gimnasio Fuerza SAS como proveedor',
      }),
    )
  }

  it('searches with the magnifier and preloads the selected person', async () => {
    const { user } = renderForm()

    await selectGym(user)

    const summary = screen.getByRole('region', { name: 'Persona seleccionada' })
    expect(within(summary).getByText('Gimnasio Fuerza SAS')).toBeInTheDocument()
    expect(within(summary).getByText('Cliente')).toBeInTheDocument()
    expect(within(summary).getByText('NIT 900123456-7')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Gimnasio Fuerza SAS')
  })

  it('sends only the person id and the trimmed commercial name', async () => {
    const { user, onCreated } = renderForm()
    await selectGym(user)

    await user.clear(screen.getByLabelText('Nombre comercial'))
    await user.type(screen.getByLabelText('Nombre comercial'), '  Fuerza Suplementos ')
    await submit(user)

    expect(createSupplier).toHaveBeenCalledWith(
      { personId: 'person-gym', commercialName: 'Fuerza Suplementos' },
      'test-token',
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  it('blocks a person who already is a supplier', async () => {
    searchPersons.mockResolvedValue(
      searchResponse([
        buildPerson({
          relationships: { hasUserAccount: false, isCustomer: false, isSupplier: true },
        }),
      ]),
    )
    const { user } = renderForm()

    await searchPerson(user, 'laura')

    expect(await screen.findByText('Ya es proveedor')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Registrar a Laura Pérez/ }),
    ).not.toBeInTheDocument()
  })

  it('handles ALREADY_SUPPLIER from the api', async () => {
    createSupplier.mockRejectedValue(
      new ApiError('This person is already registered as a supplier.', 409, {}, 'ALREADY_SUPPLIER'),
    )
    const { user, onCreated } = renderForm()
    await selectGym(user)

    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta persona ya está registrada como proveedor.',
    )
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('asks for the commercial name', async () => {
    const { user } = renderForm()
    await selectGym(user)

    await user.clear(screen.getByLabelText('Nombre comercial'))
    await submit(user)

    expect(await screen.findByText('Ingresa el nombre comercial')).toBeInTheDocument()
    expect(createSupplier).not.toHaveBeenCalled()
  })

  it('opens the new supplier form with the searched document when nobody matches', async () => {
    const { user } = renderForm()

    await startFromScratch(user, '1049777888')

    expect(screen.getByLabelText('Número de documento')).toHaveValue('1049777888')
  })
})

describe('CreateSupplierForm new company', () => {
  it('sends the company with its business name and NIT', async () => {
    const { user, onCreated } = renderForm()
    await chooseKind(user, /Empresa/)

    await user.type(screen.getByLabelText('Número de documento'), '900123456-7')
    await user.type(screen.getByLabelText('Razón social'), 'Suplementos Colombia SAS')
    await fillContact(user)
    await submit(user)

    expect(createSupplier).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'doc-nit',
          documentNumber: '900123456-7',
          businessName: 'Suplementos Colombia SAS',
          email: 'contacto@ejemplo.com',
          phone: '3001234567',
          address: 'Calle 10 # 20-30',
        },
        commercialName: 'Suplementos Colombia',
      },
      'test-token',
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  it('asks for every required field', async () => {
    const { user } = renderForm()
    await chooseKind(user, /Empresa/)

    await submit(user)

    expect(await screen.findByText('Ingresa el número de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la razón social')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el nombre comercial')).toBeInTheDocument()
    expect(createSupplier).not.toHaveBeenCalled()
  })

  it('checks the NIT format, phone digits and email', async () => {
    const { user } = renderForm()
    await chooseKind(user, /Empresa/)

    await user.type(screen.getByLabelText('Número de documento'), '900-12')
    await user.type(screen.getByLabelText('Razón social'), 'Suplementos Colombia SAS')
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo')
    await user.type(screen.getByLabelText('Teléfono'), '300 12')
    await submit(user)

    expect(
      await screen.findByText(
        'Escribe el NIT con números y, si aplica, el dígito de verificación (900123456-7)',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(
      screen.getByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(createSupplier).not.toHaveBeenCalled()
  })

  it.each([
    [
      new ApiError('Conflict', 409, {}, 'ALREADY_SUPPLIER'),
      'Esta persona ya está registrada como proveedor.',
    ],
    [
      new ApiError('Email', 409, {}, 'EMAIL_ALREADY_IN_USE'),
      'Ese correo ya pertenece a otra persona registrada.',
    ],
    [new ApiError('Forbidden', 403), 'No tienes permiso para registrar proveedores.'],
  ])('shows the api error (%s)', async (error, message) => {
    createSupplier.mockRejectedValue(error)
    const { user, onCreated } = renderForm()
    await chooseKind(user, /Empresa/)
    await user.type(screen.getByLabelText('Número de documento'), '900123456-7')
    await user.type(screen.getByLabelText('Razón social'), 'Suplementos Colombia SAS')
    await fillContact(user)

    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('CreateSupplierForm new natural person', () => {
  it('sends the natural person with names and no business name', async () => {
    const { user, onCreated } = renderForm()
    await chooseKind(user, /Persona natural/)

    await user.selectOptions(documentTypeSelect(), 'Cédula de Ciudadanía')
    await user.type(screen.getByLabelText('Número de documento'), '1049555666')
    await user.type(screen.getByLabelText('Nombres'), ' Marcela ')
    await user.type(screen.getByLabelText('Apellidos'), 'Rojas')
    await fillContact(user)
    await submit(user)

    expect(createSupplier).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'doc-cc',
          documentNumber: '1049555666',
          firstName: 'Marcela',
          lastName: 'Rojas',
          email: 'contacto@ejemplo.com',
          phone: '3001234567',
          address: 'Calle 10 # 20-30',
        },
        commercialName: 'Suplementos Colombia',
      },
      'test-token',
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  it('asks for names and a valid cédula', async () => {
    const { user } = renderForm()
    await chooseKind(user, /Persona natural/)

    await user.selectOptions(documentTypeSelect(), 'Cédula de Ciudadanía')
    await user.type(screen.getByLabelText('Número de documento'), '10A4')
    await submit(user)

    expect(await screen.findByText('Ingresa los nombres')).toBeInTheDocument()
    expect(screen.getByText('Ingresa los apellidos')).toBeInTheDocument()
    expect(screen.getByText('La cédula solo lleva números (entre 3 y 15)')).toBeInTheDocument()
    expect(createSupplier).not.toHaveBeenCalled()
  })
})

describe('CreateSupplierForm cancel', () => {
  it('cancels without saving', async () => {
    const { user, onCancel } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createSupplier).not.toHaveBeenCalled()
  })
})
