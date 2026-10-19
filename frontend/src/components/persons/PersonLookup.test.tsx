import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { personsService } from '../../services/persons.service'
import { DOCUMENT_TYPES } from '../../test-utils/customers'
import { buildPerson, searchPerson, searchResponse } from '../../test-utils/persons'
import type { PersonRole } from '../../types/person'

import { PersonLookup } from './PersonLookup'

vi.mock('../../services/persons.service', () => ({
  personsService: { search: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const search = vi.mocked(personsService.search)

const laura = buildPerson()
const gym = buildPerson({
  id: 'person-gym',
  documentTypeId: 'doc-nit',
  documentNumber: '900123456-7',
  firstName: null,
  lastName: null,
  businessName: 'Gimnasio Fuerza SAS',
  email: 'gym@correo.com',
  relationships: { hasUserAccount: false, isCustomer: true, isSupplier: true },
})
const staff = buildPerson({
  id: 'person-staff',
  documentNumber: '1098765432',
  firstName: 'Yulieth',
  lastName: 'Tarazona',
  email: 'yulieth@intelligent.co',
  relationships: { hasUserAccount: true, isCustomer: false, isSupplier: false },
})

function renderLookup(target: PersonRole = 'customer') {
  const onSelect = vi.fn()
  const onCreateNew = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <PersonLookup
        target={target}
        onSelect={onSelect}
        onCreateNew={onCreateNew}
        onCancel={onCancel}
      />
    </MemoryRouter>,
  )
  return { user, onSelect, onCreateNew, onCancel }
}

function resultFor(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(documentTypesService.list).mockResolvedValue(DOCUMENT_TYPES)
  search.mockResolvedValue(searchResponse([laura, gym, staff]))
})

describe('PersonLookup search', () => {
  it('searches people with the trimmed term', async () => {
    const { user } = renderLookup()

    await searchPerson(user, '  laura ')

    expect(search).toHaveBeenCalledWith('laura', 5, 'test-token')
    expect(await screen.findByRole('list', { name: 'Personas encontradas' })).toBeInTheDocument()
  })

  it('asks for at least two characters', async () => {
    const { user } = renderLookup()

    await searchPerson(user, 'l')

    expect(
      await screen.findByText('Escribe al menos 2 caracteres para buscar.'),
    ).toBeInTheDocument()
    expect(search).not.toHaveBeenCalled()
  })

  it('shows the document, email and current roles of each person', async () => {
    const { user } = renderLookup()

    await searchPerson(user, 'correo')

    const gymResult = await screen.findByText('Gimnasio Fuerza SAS')
    const item = gymResult.closest('li') as HTMLElement
    expect(within(item).getByText('NIT 900123456-7 · gym@correo.com')).toBeInTheDocument()
    expect(within(item).getByText('Cliente')).toBeInTheDocument()
    expect(within(item).getByText('Proveedor')).toBeInTheDocument()
    expect(within(resultFor('Laura Pérez')).getByText('Sin rol en el sistema')).toBeInTheDocument()
    expect(within(resultFor('Yulieth Tarazona')).getByText('Usuario')).toBeInTheDocument()
  })

  it('shows the search error', async () => {
    search.mockRejectedValue(new ApiError('Forbidden', 403))
    const { user } = renderLookup()

    await searchPerson(user, 'laura')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No tienes permiso para buscar personas.',
    )
  })
})

describe('PersonLookup choices', () => {
  it('blocks a person who already is a customer and links to the detail', async () => {
    const { user } = renderLookup('customer')

    await searchPerson(user, 'correo')

    const item = await screen
      .findByText('Gimnasio Fuerza SAS')
      .then((node) => node.closest('li') as HTMLElement)
    expect(within(item).getByText('Ya es cliente')).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: 'Ver detalle' })).toHaveAttribute(
      'href',
      '/clientes/person-gym',
    )
    expect(within(item).queryByRole('button')).not.toBeInTheDocument()
  })

  it('blocks companies and people who already have a user account', async () => {
    const { user } = renderLookup('user')

    await searchPerson(user, 'correo')

    await screen.findByText('Gimnasio Fuerza SAS')
    expect(
      within(resultFor('Gimnasio Fuerza SAS')).getByText('Una empresa no puede tener usuario'),
    ).toBeInTheDocument()
    expect(within(resultFor('Yulieth Tarazona')).getByText('Ya tiene usuario')).toBeInTheDocument()
    expect(
      within(resultFor('Yulieth Tarazona')).getByRole('link', { name: 'Ver detalle' }),
    ).toHaveAttribute('href', '/usuarios/person-staff')
  })

  it('blocks a person who already is a supplier', async () => {
    const { user } = renderLookup('supplier')

    await searchPerson(user, 'correo')

    await screen.findByText('Gimnasio Fuerza SAS')
    expect(
      within(resultFor('Gimnasio Fuerza SAS')).getByText('Ya es proveedor'),
    ).toBeInTheDocument()
    expect(
      within(resultFor('Yulieth Tarazona')).getByRole('button', {
        name: 'Registrar a Yulieth Tarazona como proveedor',
      }),
    ).toBeInTheDocument()
  })

  it('selects a person that can take the role', async () => {
    const { user, onSelect } = renderLookup('customer')

    await searchPerson(user, 'laura')
    await user.click(
      await screen.findByRole('button', { name: 'Registrar a Laura Pérez como cliente' }),
    )

    expect(onSelect).toHaveBeenCalledWith(laura)
  })

  it('offers to create from scratch with the searched term when nobody matches', async () => {
    search.mockResolvedValue(searchResponse([]))
    const { user, onCreateNew } = renderLookup()

    expect(screen.queryByRole('button', { name: 'Crear desde cero' })).not.toBeInTheDocument()
    await searchPerson(user, '1049777888')

    expect(await screen.findByText(/No encontramos a nadie con «1049777888»/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Crear desde cero' }))
    expect(onCreateNew).toHaveBeenCalledWith('1049777888')
  })

  it('does not offer to create from scratch when the document already exists', async () => {
    search.mockResolvedValue(searchResponse([laura]))
    const { user } = renderLookup()

    await searchPerson(user, '1049000111')

    await screen.findByText('Laura Pérez')
    expect(screen.queryByRole('button', { name: 'Crear desde cero' })).not.toBeInTheDocument()
  })

  it('cancels', async () => {
    const { user, onCancel } = renderLookup()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
