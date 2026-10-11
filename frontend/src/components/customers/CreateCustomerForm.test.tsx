import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { personsService } from '../../services/persons.service'
import {
  DOCUMENT_TYPES,
  buildCompanyCustomer,
  buildNaturalCustomer,
} from '../../test-utils/customers'
import { buildPerson, openNewForm, searchPerson, searchResponse } from '../../test-utils/persons'

import { CreateCustomerForm } from './CreateCustomerForm'

vi.mock('../../services/customers.service', () => ({
  customersService: { create: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../services/persons.service', () => ({
  personsService: { search: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createCustomer = vi.mocked(customersService.create)
const listDocumentTypes = vi.mocked(documentTypesService.list)
const searchPersons = vi.mocked(personsService.search)

function renderForm() {
  const onCreated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <CreateCustomerForm onCreated={onCreated} onCancel={onCancel} />
    </MemoryRouter>,
  )
  return { user, onCreated, onCancel }
}

async function renderNewForm() {
  const rendered = renderForm()
  await openNewForm(rendered.user)
  return rendered
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

async function waitForDocumentTypes() {
  await waitFor(() => expect(optionLabels().length).toBeGreaterThan(0))
}

async function fillNatural(user: ReturnType<typeof userEvent.setup>) {
  await waitForDocumentTypes()
  await user.selectOptions(documentTypeSelect(), 'Cédula de Ciudadanía')
  await user.type(screen.getByLabelText('Número de documento'), ' 1049000111 ')
  await user.type(screen.getByLabelText('Nombres'), ' Laura ')
  await user.type(screen.getByLabelText('Apellidos'), 'Pérez')
  await user.type(screen.getByLabelText('Correo electrónico'), 'Laura@Correo.com')
  await user.type(screen.getByLabelText('Teléfono'), '3001112233')
  await user.type(screen.getByLabelText('Dirección'), 'Calle 20 # 10-15, Tunja')
}

function submit(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Registrar cliente' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  listDocumentTypes.mockResolvedValue(DOCUMENT_TYPES)
  searchPersons.mockResolvedValue(searchResponse([]))
  createCustomer.mockResolvedValue(buildNaturalCustomer())
})

describe('CreateCustomerForm person lookup', () => {
  it('starts by searching the person before showing the form', () => {
    renderForm()

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Número de documento')).not.toBeInTheDocument()
  })

  it('registers an existing person with only their id', async () => {
    const staff = buildPerson({
      id: 'person-staff',
      firstName: 'Yulieth',
      lastName: 'Tarazona',
      relationships: { hasUserAccount: true, isCustomer: false, isSupplier: false },
    })
    searchPersons.mockResolvedValue(searchResponse([staff]))
    const { user, onCreated } = renderForm()

    await searchPerson(user, 'yulieth')
    await user.click(
      await screen.findByRole('button', { name: 'Registrar a Yulieth Tarazona como cliente' }),
    )
    const summary = screen.getByRole('region', { name: 'Persona seleccionada' })
    expect(within(summary).getByText('Yulieth Tarazona')).toBeInTheDocument()
    expect(within(summary).getByText('Usuario')).toBeInTheDocument()
    await submit(user)

    expect(createCustomer).toHaveBeenCalledWith({ personId: 'person-staff' }, 'test-token')
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(buildNaturalCustomer(), false))
  })

  it('shows the api error when registering an existing person fails', async () => {
    searchPersons.mockResolvedValue(searchResponse([buildPerson()]))
    createCustomer.mockRejectedValue(new ApiError('Already customer', 409, {}, 'ALREADY_CUSTOMER'))
    const { user, onCreated } = renderForm()

    await searchPerson(user, 'laura')
    await user.click(await screen.findByRole('button', { name: /Registrar a Laura Pérez/ }))
    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('Este cliente ya está registrado.')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('goes back to the search from the selected person', async () => {
    searchPersons.mockResolvedValue(searchResponse([buildPerson()]))
    const { user } = renderForm()

    await searchPerson(user, 'laura')
    await user.click(await screen.findByRole('button', { name: /Registrar a Laura Pérez/ }))
    await user.click(screen.getByRole('button', { name: 'Cambiar persona' }))

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
  })

  it('creates from scratch with the searched document already written', async () => {
    const { user } = renderForm()

    await openNewForm(user, '1049777888')

    expect(screen.getByLabelText('Número de documento')).toHaveValue('1049777888')
    await user.click(screen.getByRole('button', { name: '← Volver a buscar' }))
    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
  })

  it('creates from scratch with the searched email already written', async () => {
    const { user } = renderForm()

    await openNewForm(user, 'Nueva@Correo.com')

    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('nueva@correo.com')
  })
})

describe('CreateCustomerForm person type', () => {
  it('starts as a natural person with personal documents and name fields', async () => {
    await renderNewForm()

    expect(screen.getByRole('radio', { name: /Persona natural/ })).toBeChecked()
    await waitForDocumentTypes()
    expect(optionLabels()).toEqual(['Cédula de Ciudadanía', 'Cédula de Extranjería', 'Pasaporte'])
    expect(screen.getByLabelText('Nombres')).toBeInTheDocument()
    expect(screen.getByLabelText('Apellidos')).toBeInTheDocument()
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument()
  })

  it('switches to a company with NIT selected and the business name field', async () => {
    const { user } = await renderNewForm()
    await waitForDocumentTypes()

    await user.click(screen.getByRole('radio', { name: /Empresa/ }))

    expect(optionLabels()).toEqual(['Número de Identificación Tributaria'])
    expect(documentTypeSelect()).toHaveValue('doc-nit')
    expect(screen.getByLabelText('Razón social')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
  })
})

describe('CreateCustomerForm validation', () => {
  it('asks for every required field before calling the api', async () => {
    const { user } = await renderNewForm()
    await waitForDocumentTypes()

    await submit(user)

    expect(await screen.findByText('Selecciona el tipo de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el número de documento')).toBeInTheDocument()
    expect(screen.getByText('Ingresa los nombres')).toBeInTheDocument()
    expect(screen.getByText('Ingresa los apellidos')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(createCustomer).not.toHaveBeenCalled()
  })

  it('asks for the business name when the customer is a company', async () => {
    const { user } = await renderNewForm()
    await waitForDocumentTypes()
    await user.click(screen.getByRole('radio', { name: /Empresa/ }))

    await submit(user)

    expect(await screen.findByText('Ingresa la razón social')).toBeInTheDocument()
    expect(screen.queryByText('Ingresa los nombres')).not.toBeInTheDocument()
  })

  it.each([
    ['Cédula de Ciudadanía', '10A49', 'La cédula solo lleva números (entre 3 y 15)'],
    ['Pasaporte', 'AB1', 'El pasaporte lleva entre 5 y 20 letras o números'],
  ])('checks the %s number format', async (documentType, value, message) => {
    const { user } = await renderNewForm()
    await waitForDocumentTypes()

    await user.selectOptions(documentTypeSelect(), documentType)
    await user.type(screen.getByLabelText('Número de documento'), value)
    await submit(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
  })

  it('checks the NIT format, phone digits and email', async () => {
    const { user } = await renderNewForm()
    await waitForDocumentTypes()
    await user.click(screen.getByRole('radio', { name: /Empresa/ }))

    await user.type(screen.getByLabelText('Número de documento'), '900-12')
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
    expect(createCustomer).not.toHaveBeenCalled()
  })
})

describe('CreateCustomerForm saving', () => {
  it('sends a natural person with trimmed values and a lowercase email', async () => {
    const { user, onCreated } = await renderNewForm()
    await fillNatural(user)

    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(buildNaturalCustomer(), false))
    expect(createCustomer).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'doc-cc',
          documentNumber: '1049000111',
          firstName: 'Laura',
          lastName: 'Pérez',
          email: 'laura@correo.com',
          phone: '3001112233',
          address: 'Calle 20 # 10-15, Tunja',
        },
      },
      'test-token',
    )
  })

  it('sends a company with its business name and NIT', async () => {
    createCustomer.mockResolvedValue(buildCompanyCustomer())
    const { user, onCreated } = await renderNewForm()
    await waitForDocumentTypes()
    await user.click(screen.getByRole('radio', { name: /Empresa/ }))
    await user.type(screen.getByLabelText('Número de documento'), '900123456-7')
    await user.type(screen.getByLabelText('Razón social'), 'Gimnasio Fuerza SAS')
    await user.type(screen.getByLabelText('Correo electrónico'), 'gym@correo.com')
    await user.type(screen.getByLabelText('Teléfono'), '6087401122')
    await user.type(screen.getByLabelText('Dirección'), 'Av. Norte # 45-10, Tunja')

    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(buildCompanyCustomer(), false))
    expect(createCustomer).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'doc-nit',
          documentNumber: '900123456-7',
          businessName: 'Gimnasio Fuerza SAS',
          email: 'gym@correo.com',
          phone: '6087401122',
          address: 'Av. Norte # 45-10, Tunja',
        },
      },
      'test-token',
    )
  })

  it('tells when the document already belonged to a person with other data', async () => {
    const existing = buildNaturalCustomer({ fullName: 'Laura Marcela Pérez' })
    createCustomer.mockResolvedValue(existing)
    const { user, onCreated } = await renderNewForm()
    await fillNatural(user)

    await submit(user)

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(existing, true))
  })

  it('shows the saving state while the request is pending', async () => {
    createCustomer.mockReturnValue(new Promise(() => {}))
    const { user } = await renderNewForm()
    await fillNatural(user)

    await submit(user)

    expect(await screen.findByRole('button', { name: 'Registrando...' })).toBeDisabled()
  })

  it.each([
    [
      new ApiError('This person is already registered as a customer.', 409, {}, 'ALREADY_CUSTOMER'),
      'Este cliente ya está registrado. Búscalo por su documento en el listado.',
    ],
    [
      new ApiError('Email in use', 409, {}, 'EMAIL_ALREADY_IN_USE'),
      'Ese correo ya pertenece a otra persona registrada. Usa un correo diferente.',
    ],
    [new ApiError('Forbidden', 403), 'No tienes permiso para realizar esta acción.'],
    [new Error('Network down'), 'No fue posible registrar el cliente. Intenta de nuevo.'],
  ])('shows the api error (%s)', async (error, message) => {
    createCustomer.mockRejectedValue(error)
    const { user, onCreated } = await renderNewForm()
    await fillNatural(user)

    await submit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Registrar cliente' })).toBeEnabled()
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = await renderNewForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(createCustomer).not.toHaveBeenCalled()
  })
})
