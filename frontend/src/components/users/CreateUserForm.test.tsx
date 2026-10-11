import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { branchesService } from '../../services/branches.service'
import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { personsService } from '../../services/persons.service'
import { rolesService } from '../../services/roles.service'
import { usersService } from '../../services/users.service'
import { buildPerson, openNewForm, searchPerson, searchResponse } from '../../test-utils/persons'

import { CreateUserForm } from './CreateUserForm'

vi.mock('../../services/users.service', () => ({
  usersService: { create: vi.fn() },
}))

vi.mock('../../services/roles.service', () => ({
  rolesService: { list: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../services/branches.service', () => ({
  branchesService: { list: vi.fn() },
}))

vi.mock('../../services/persons.service', () => ({
  personsService: { search: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const createUser = vi.mocked(usersService.create)
const searchPersons = vi.mocked(personsService.search)

const DOCUMENT_TYPES = [
  { id: 'doc-cc', code: 'CC', name: 'Cédula de Ciudadanía', active: true },
  { id: 'doc-ce', code: 'CE', name: 'Cédula de Extranjería', active: true },
  { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
  { id: 'doc-pas', code: 'PAS', name: 'Pasaporte', active: true },
]

function renderForm() {
  const onCreated = vi.fn()
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <CreateUserForm onCreated={onCreated} onCancel={vi.fn()} />
    </MemoryRouter>,
  )
  return { user, onCreated }
}

async function waitForOptions(label: string) {
  const select = screen.getByRole('combobox', { name: label })
  await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1))
  return select
}

function optionLabels(select: HTMLElement) {
  return within(select)
    .getAllByRole('option')
    .filter((option) => (option as HTMLOptionElement).value !== '')
    .map((option) => option.textContent)
}

async function fillRequiredExceptContact(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await waitForOptions('Tipo de documento'), 'Cédula de Ciudadanía')
  await user.type(screen.getByLabelText('Número de documento'), '1049123456')
  await user.type(screen.getByLabelText('Nombres'), 'Yulieth')
  await user.type(screen.getByLabelText('Apellidos'), 'Tarazona')
  await user.type(screen.getByLabelText('Correo electrónico'), 'testeus13@gmail.com')
  await user.selectOptions(await waitForOptions('Rol'), 'Ayudante de Sede')
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(documentTypesService.list).mockResolvedValue(DOCUMENT_TYPES)
  vi.mocked(rolesService.list).mockResolvedValue([
    { id: 'role-assistant', name: 'BRANCH_ASSISTANT', active: true },
  ])
  vi.mocked(branchesService.list).mockResolvedValue({
    data: [{ id: 'branch-makro', name: 'Sede Makro', address: 'x', phone: '1', active: true }],
    meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
  })
  searchPersons.mockResolvedValue(searchResponse([]))
  createUser.mockResolvedValue(undefined as never)
})

describe('CreateUserForm existing person', () => {
  const laura = buildPerson({
    relationships: { hasUserAccount: false, isCustomer: true, isSupplier: false },
  })

  async function selectLaura(user: ReturnType<typeof userEvent.setup>) {
    searchPersons.mockResolvedValue(searchResponse([laura]))
    await searchPerson(user, 'laura')
    await user.click(
      await screen.findByRole('button', { name: 'Registrar a Laura Pérez como usuario' }),
    )
  }

  it('starts by searching the person', () => {
    renderForm()

    expect(screen.getByRole('searchbox', { name: 'Buscar persona' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
  })

  it('asks for the role before registering an existing person', async () => {
    const { user } = renderForm()
    await selectLaura(user)

    expect(
      screen.getByText(/El enlace de activación llegará a laura@correo.com/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona un rol')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('registers the existing person with its id, role and branches', async () => {
    const { user, onCreated } = renderForm()
    await selectLaura(user)

    await user.selectOptions(await waitForOptions('Rol'), 'Ayudante de Sede')
    await user.click(await screen.findByRole('checkbox', { name: 'Sede Makro' }))
    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(createUser).toHaveBeenCalledWith(
      { personId: 'person-laura', roleId: 'role-assistant', branchIds: ['branch-makro'] },
      'test-token',
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  it('explains when the person already has an account', async () => {
    createUser.mockRejectedValue(new ApiError('Person already has a user account', 409))
    const { user, onCreated } = renderForm()
    await selectLaura(user)

    await user.selectOptions(await waitForOptions('Rol'), 'Ayudante de Sede')
    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta persona ya tiene una cuenta de usuario.',
    )
    expect(onCreated).not.toHaveBeenCalled()
  })
})

describe('CreateUserForm new person', () => {
  it('only offers documents of natural persons', async () => {
    const { user } = renderForm()
    await openNewForm(user)

    expect(optionLabels(await waitForOptions('Tipo de documento'))).toEqual([
      'Cédula de Ciudadanía',
      'Cédula de Extranjería',
      'Pasaporte',
    ])
  })

  it('marks phone and address as required fields', async () => {
    const { user } = renderForm()
    await openNewForm(user)

    expect(screen.getByLabelText('Teléfono')).toBeInTheDocument()
    expect(screen.getByLabelText('Dirección')).toBeInTheDocument()
    expect(
      screen.queryByText(/Teléfono \(opcional\)|Dirección \(opcional\)/),
    ).not.toBeInTheDocument()
  })

  it('does not call the api without phone and address', async () => {
    const { user } = renderForm()
    await openNewForm(user)
    await fillRequiredExceptContact(user)

    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(await screen.findByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(createUser).not.toHaveBeenCalled()
  })

  it('rejects a phone with characters other than digits and a malformed document', async () => {
    const { user } = renderForm()
    await openNewForm(user)
    await fillRequiredExceptContact(user)

    await user.clear(screen.getByLabelText('Número de documento'))
    await user.type(screen.getByLabelText('Número de documento'), '10A4')
    await user.type(screen.getByLabelText('Teléfono'), '300-123')
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30')
    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(
      await screen.findByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(screen.getByText('La cédula solo lleva números (entre 3 y 15)')).toBeInTheDocument()
    expect(createUser).not.toHaveBeenCalled()
  })

  it('always sends phone and address to the api', async () => {
    const { user, onCreated } = renderForm()
    await openNewForm(user)
    await fillRequiredExceptContact(user)

    await user.type(screen.getByLabelText('Teléfono'), ' 3001234567 ')
    await user.type(screen.getByLabelText('Dirección'), ' Calle 10 # 20-30 ')
    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(createUser).toHaveBeenCalledWith(
      {
        person: {
          documentTypeId: 'doc-cc',
          documentNumber: '1049123456',
          firstName: 'Yulieth',
          lastName: 'Tarazona',
          email: 'testeus13@gmail.com',
          phone: '3001234567',
          address: 'Calle 10 # 20-30',
        },
        roleId: 'role-assistant',
      },
      'test-token',
    )
  })

  it('explains when the email belongs to another person', async () => {
    createUser.mockRejectedValue(new ApiError('Email in use', 409, {}, 'EMAIL_ALREADY_IN_USE'))
    const { user } = renderForm()
    await openNewForm(user)
    await fillRequiredExceptContact(user)
    await user.type(screen.getByLabelText('Teléfono'), '3001234567')
    await user.type(screen.getByLabelText('Dirección'), 'Calle 10 # 20-30')

    await user.click(screen.getByRole('button', { name: 'Registrar usuario' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese correo ya pertenece a otra persona registrada.',
    )
  })
})
