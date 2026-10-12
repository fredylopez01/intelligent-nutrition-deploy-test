import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import {
  DOCUMENT_TYPES,
  buildCompanyCustomer,
  buildNaturalCustomer,
} from '../../test-utils/customers'
import type { Customer } from '../../types/customer'

import { CustomerDataForm } from './CustomerDataForm'

vi.mock('../../services/customers.service', () => ({
  customersService: { update: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateCustomer = vi.mocked(customersService.update)
const listDocumentTypes = vi.mocked(documentTypesService.list)

const laura = buildNaturalCustomer()
const gym = buildCompanyCustomer()

function renderForm(customer: Customer = laura) {
  const onSaved = vi.fn()
  const user = userEvent.setup()
  const view = render(<CustomerDataForm customer={customer} onSaved={onSaved} />)
  return { user, onSaved, rerender: view.rerender }
}

function field(label: string) {
  return screen.getByLabelText(label)
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Actualizar información' }))
  await waitFor(() =>
    expect(
      screen.getAllByRole('option').filter((option) => (option as HTMLOptionElement).value !== ''),
    ).not.toHaveLength(0),
  )
}

async function replaceText(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  await user.clear(field(label))
  await user.type(field(label), value)
}

beforeEach(() => {
  vi.resetAllMocks()
  listDocumentTypes.mockResolvedValue(DOCUMENT_TYPES)
  updateCustomer.mockResolvedValue(laura)
})

describe('CustomerDataForm read mode', () => {
  it('shows the data of a natural person without allowing changes', () => {
    renderForm()

    expect(field('Tipo de documento')).toHaveValue('Cédula de Ciudadanía')
    expect(field('Número de documento')).toHaveValue('1049000111')
    expect(field('Nombres')).toHaveValue('Laura')
    expect(field('Apellidos')).toHaveValue('Pérez')
    expect(field('Correo electrónico')).toHaveValue('laura@correo.com')
    expect(field('Teléfono')).toHaveValue('3001112233')
    expect(field('Dirección')).toHaveValue('Calle 20 # 10-15, Tunja')
    for (const label of [
      'Tipo de documento',
      'Número de documento',
      'Nombres',
      'Apellidos',
      'Correo electrónico',
      'Teléfono',
      'Dirección',
    ]) {
      expect(field(label)).toHaveAttribute('readonly')
    }
    expect(screen.getByRole('button', { name: 'Actualizar información' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('shows the business name of a company instead of the personal names', () => {
    renderForm(gym)

    expect(field('Razón social')).toHaveValue('Gimnasio Fuerza SAS')
    expect(field('Número de documento')).toHaveValue('900123456-7')
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Apellidos')).not.toBeInTheDocument()
  })

  it('shows the new data when the customer is refreshed', () => {
    const { rerender } = renderForm()

    rerender(
      <CustomerDataForm
        customer={buildNaturalCustomer({
          person: { ...laura.person, phone: '3009998877' },
        })}
        onSaved={vi.fn()}
      />,
    )

    expect(field('Teléfono')).toHaveValue('3009998877')
  })
})

describe('CustomerDataForm edit mode', () => {
  it('enables every field and focuses the first name', async () => {
    const { user } = renderForm()

    await startEditing(user)

    for (const label of [
      'Número de documento',
      'Nombres',
      'Apellidos',
      'Correo electrónico',
      'Teléfono',
      'Dirección',
    ]) {
      expect(field(label)).not.toHaveAttribute('readonly')
    }
    expect(field('Tipo de documento')).toBeEnabled()
    expect(field('Nombres')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Actualizar información' })).not.toBeInTheDocument()
  })

  it('focuses the business name of a company', async () => {
    const { user } = renderForm(gym)

    await startEditing(user)

    expect(field('Razón social')).toHaveFocus()
  })

  it('explains that the document change reaches the other roles of the person', async () => {
    const { user } = renderForm()

    await startEditing(user)

    expect(screen.getByText(/el cambio se refleja allí/)).toBeInTheDocument()
  })

  it('offers only the NIT to a company', async () => {
    const { user } = renderForm(gym)

    await startEditing(user)

    expect(
      screen
        .getAllByRole('option')
        .filter((option) => (option as HTMLOptionElement).value !== '')
        .map((option) => option.textContent),
    ).toEqual(['Número de Identificación Tributaria'])
  })

  it('keeps the current document type available when it was deactivated', async () => {
    listDocumentTypes.mockResolvedValue([
      { id: 'doc-cc', code: 'CC', name: 'Cédula de Ciudadanía', active: false },
      { id: 'doc-ce', code: 'CE', name: 'Cédula de Extranjería', active: true },
      { id: 'doc-pas', code: 'PAS', name: 'Pasaporte', active: false },
      { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
    ])
    const { user } = renderForm()

    await startEditing(user)

    expect(
      screen
        .getAllByRole('option')
        .filter((option) => (option as HTMLOptionElement).value !== '')
        .map((option) => option.textContent),
    ).toEqual(['Cédula de Ciudadanía', 'Cédula de Extranjería'])
    expect(field('Tipo de documento')).toHaveValue('doc-cc')
  })

  it('explains the failure when the document types cannot be loaded', async () => {
    listDocumentTypes.mockRejectedValue(new Error('Network down'))
    const { user } = renderForm()

    await user.click(screen.getByRole('button', { name: 'Actualizar información' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No fue posible cargar los tipos de documento.',
    )
    expect(field('Nombres')).not.toHaveAttribute('readonly')
  })
})

describe('CustomerDataForm saving', () => {
  it('sends only the changed fields, trimmed and with a lowercase email', async () => {
    const updated = buildNaturalCustomer({
      person: { ...laura.person, phone: '3127778899', email: 'laura.p@correo.com' },
    })
    updateCustomer.mockResolvedValue(updated)
    const { user, onSaved } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Teléfono', ' 3127778899 ')
    await replaceText(user, 'Correo electrónico', ' Laura.P@Correo.com ')
    await save(user)

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-laura',
      { person: { email: 'laura.p@correo.com', phone: '3127778899' } },
      'test-token',
    )
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(await screen.findByText('Cliente actualizado exitosamente.')).toBeInTheDocument()
  })

  it('goes back to read mode after saving', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Dirección', 'Carrera 9 # 8-7')
    await save(user)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actualizar información' })).toBeInTheDocument(),
    )
    expect(field('Dirección')).toHaveAttribute('readonly')
  })

  it('sends the names of a natural person together', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Nombres', 'Laura Marcela')
    await save(user)

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-laura',
      { person: { firstName: 'Laura Marcela' } },
      'test-token',
    )
  })

  it('sends the business name of a company', async () => {
    updateCustomer.mockResolvedValue(gym)
    const { user } = renderForm(gym)
    await startEditing(user)

    await replaceText(user, 'Razón social', 'Gimnasio Fuerza Boyacá SAS')
    await save(user)

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-gym',
      { person: { businessName: 'Gimnasio Fuerza Boyacá SAS' } },
      'test-token',
    )
  })

  it('sends the document type and number together when only the number changes', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Número de documento', ' 1049000999 ')
    await save(user)

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-laura',
      { person: { documentTypeId: 'doc-cc', documentNumber: '1049000999' } },
      'test-token',
    )
  })

  it('sends the document type and number together when only the type changes', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.selectOptions(field('Tipo de documento'), 'Pasaporte')
    await save(user)

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-laura',
      { person: { documentTypeId: 'doc-pas', documentNumber: '1049000111' } },
      'test-token',
    )
  })

  it('does not call the api when nothing changed', async () => {
    const { user, onSaved } = renderForm()
    await startEditing(user)

    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateCustomer).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows the saving state and blocks both actions while the request is pending', async () => {
    updateCustomer.mockReturnValue(new Promise(() => {}))
    const { user } = renderForm()
    await startEditing(user)
    await replaceText(user, 'Teléfono', '3127778899')

    await save(user)

    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  })

  it.each([
    [
      new ApiError('Email in use', 409, {}, 'EMAIL_ALREADY_IN_USE'),
      'Ese correo ya pertenece a otra persona registrada. Usa un correo diferente.',
    ],
    [
      new ApiError('Document in use', 409, {}, 'DOCUMENT_ALREADY_IN_USE'),
      'Ese documento ya pertenece a otra persona registrada.',
    ],
    [new ApiError('Forbidden', 403), 'No tienes permiso para realizar esta acción.'],
    [
      new ApiError('Not found', 404),
      'El cliente o la persona ya no existe o está inactiva. Recarga e intenta de nuevo.',
    ],
    [new Error('Network down'), 'No fue posible guardar los cambios. Intenta de nuevo.'],
  ])('shows the api error (%s) and stays in edit mode', async (error, message) => {
    updateCustomer.mockRejectedValue(error)
    const { user, onSaved } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Teléfono', '3127778899')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onSaved).not.toHaveBeenCalled()
    expect(field('Teléfono')).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })
})

describe('CustomerDataForm validation', () => {
  it('asks for the names, phone, email and address before calling the api', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Nombres'))
    await user.clear(field('Apellidos'))
    await user.clear(field('Correo electrónico'))
    await user.clear(field('Teléfono'))
    await user.clear(field('Dirección'))
    await save(user)

    expect(await screen.findByText('Ingresa los nombres')).toBeInTheDocument()
    expect(screen.getByText('Ingresa los apellidos')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el correo electrónico')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('asks for the business name of a company', async () => {
    const { user } = renderForm(gym)
    await startEditing(user)

    await user.clear(field('Razón social'))
    await save(user)

    expect(await screen.findByText('Ingresa la razón social')).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('checks the email and the phone format', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Correo electrónico', 'no-es-correo')
    await replaceText(user, 'Teléfono', '300-111')
    await save(user)

    expect(await screen.findByText('Ingresa un correo válido')).toBeInTheDocument()
    expect(
      screen.getByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('asks for the document number when it is emptied', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field('Número de documento'))
    await save(user)

    expect(await screen.findByText('Ingresa el número de documento')).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('checks the document number format of the selected type', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Número de documento', '10A49')
    await save(user)

    expect(
      await screen.findByText('La cédula solo lleva números (entre 3 y 15)'),
    ).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it.each([
    [
      'Número de documento',
      'A'.repeat(51),
      'El número de documento no puede superar 50 caracteres',
    ],
    ['Nombres', 'N'.repeat(101), 'Los nombres no pueden superar 100 caracteres'],
    ['Apellidos', 'A'.repeat(101), 'Los apellidos no pueden superar 100 caracteres'],
  ])('rejects a %s longer than the allowed length', async (label, value, message) => {
    const { user } = renderForm()
    await startEditing(user)

    await user.clear(field(label))
    await user.click(field(label))
    await user.paste(value)
    await save(user)

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })
})

describe('CustomerDataForm cancel', () => {
  it('discards the changes and goes back to read mode', async () => {
    const { user } = renderForm()
    await startEditing(user)

    await replaceText(user, 'Dirección', 'Otra dirección')
    await replaceText(user, 'Número de documento', '1049000999')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(field('Dirección')).toHaveValue('Calle 20 # 10-15, Tunja')
    expect(field('Número de documento')).toHaveValue('1049000111')
    expect(field('Dirección')).toHaveAttribute('readonly')
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('clears the previous message when the edition is cancelled', async () => {
    updateCustomer.mockRejectedValue(new Error('Network down'))
    const { user } = renderForm()
    await startEditing(user)
    await replaceText(user, 'Teléfono', '3127778899')
    await save(user)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears the previous message when a new edition starts', async () => {
    const { user } = renderForm()
    await startEditing(user)
    await save(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    await startEditing(user)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
