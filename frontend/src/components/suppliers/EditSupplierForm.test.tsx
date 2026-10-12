import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { documentTypesService } from '../../services/document-types.service'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { Supplier } from '../../types/supplier'

import { EditSupplierForm } from './EditSupplierForm'

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { update: vi.fn() },
}))

vi.mock('../../services/document-types.service', () => ({
  documentTypesService: { list: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateSupplier = vi.mocked(suppliersService.update)

const DOCUMENT_TYPES = [
  { id: 'doc-cc', code: 'CC', name: 'Cédula de Ciudadanía', active: true },
  { id: 'doc-ce', code: 'CE', name: 'Cédula de Extranjería', active: true },
  { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
  { id: 'doc-pas', code: 'PAS', name: 'Pasaporte', active: true },
]

const company: Supplier = {
  id: 'supplier-1',
  commercialName: 'Suplementos Norte',
  person: {
    documentTypeId: 'doc-nit',
    firstName: null,
    lastName: null,
    businessName: 'Suplementos Norte SAS',
    documentNumber: '900123456-7',
    documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
    email: 'contacto@norte.test',
    phone: '3001112222',
    address: 'Calle 10 # 20-30',
    active: true,
  },
}

const naturalPerson: Supplier = {
  id: 'supplier-2',
  commercialName: 'Distribuciones Marcela',
  person: {
    documentTypeId: 'doc-cc',
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

async function renderForm(supplier: Supplier = company) {
  const onUpdated = vi.fn()
  const onCancel = vi.fn()
  const user = userEvent.setup()
  render(<EditSupplierForm supplier={supplier} onUpdated={onUpdated} onCancel={onCancel} />)
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toHaveValue(
      supplier.person.documentTypeId,
    ),
  )
  return { user, onUpdated, onCancel }
}

function field(label: string) {
  return screen.getByLabelText(label)
}

function save(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(documentTypesService.list).mockResolvedValue(DOCUMENT_TYPES)
  updateSupplier.mockResolvedValue(company)
})

describe('EditSupplierForm preloaded fields', () => {
  it('preloads every person field of a company', async () => {
    await renderForm()

    expect(field('Número de documento')).toHaveValue('900123456-7')
    expect(field('Razón social')).toHaveValue('Suplementos Norte SAS')
    expect(field('Correo electrónico')).toHaveValue('contacto@norte.test')
    expect(field('Teléfono')).toHaveValue('3001112222')
    expect(field('Dirección')).toHaveValue('Calle 10 # 20-30')
    expect(field('Nombre comercial')).toHaveValue('Suplementos Norte')
    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
  })

  it('preloads names and only offers personal documents to a natural person', async () => {
    await renderForm(naturalPerson)

    expect(field('Nombres')).toHaveValue('Marcela')
    expect(field('Apellidos')).toHaveValue('Rojas')
    expect(screen.queryByLabelText('Razón social')).not.toBeInTheDocument()
    const options = within(screen.getByRole('combobox', { name: 'Tipo de documento' }))
      .getAllByRole('option')
      .filter((option) => (option as HTMLOptionElement).value !== '')
      .map((option) => option.textContent)
    expect(options).toEqual(['Cédula de Ciudadanía', 'Cédula de Extranjería', 'Pasaporte'])
  })
})

describe('EditSupplierForm saving', () => {
  it('sends only the changed person fields inside person', async () => {
    const { user, onUpdated } = await renderForm()

    await user.clear(field('Teléfono'))
    await user.type(field('Teléfono'), '3009998888')
    await user.clear(field('Correo electrónico'))
    await user.type(field('Correo electrónico'), ' Ventas@Norte.test ')
    await save(user)

    expect(updateSupplier).toHaveBeenCalledWith(
      'supplier-1',
      { person: { email: 'ventas@norte.test', phone: '3009998888' } },
      'test-token',
    )
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1))
  })

  it('sends the commercial name outside person', async () => {
    const { user } = await renderForm()

    await user.clear(field('Nombre comercial'))
    await user.type(field('Nombre comercial'), 'Norte Nutrición')
    await save(user)

    expect(updateSupplier).toHaveBeenCalledWith(
      'supplier-1',
      { commercialName: 'Norte Nutrición' },
      'test-token',
    )
  })

  it('sends the document type and number together when the number changes', async () => {
    const { user } = await renderForm()

    await user.clear(field('Número de documento'))
    await user.type(field('Número de documento'), '900999888-1')
    await save(user)

    expect(updateSupplier).toHaveBeenCalledWith(
      'supplier-1',
      { person: { documentTypeId: 'doc-nit', documentNumber: '900999888-1' } },
      'test-token',
    )
  })

  it('edits the names of a natural person', async () => {
    const { user } = await renderForm(naturalPerson)

    await user.clear(field('Apellidos'))
    await user.type(field('Apellidos'), 'Rojas Pérez')
    await save(user)

    expect(updateSupplier).toHaveBeenCalledWith(
      'supplier-2',
      { person: { lastName: 'Rojas Pérez' } },
      'test-token',
    )
  })

  it('does not call the api when nothing changed', async () => {
    const { user } = await renderForm()

    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateSupplier).not.toHaveBeenCalled()
  })
})

describe('EditSupplierForm validation', () => {
  it('uses the same rules as the registration', async () => {
    const { user } = await renderForm()

    await user.clear(field('Razón social'))
    await user.clear(field('Dirección'))
    await user.clear(field('Teléfono'))
    await user.type(field('Teléfono'), '300 abc')
    await user.clear(field('Número de documento'))
    await user.type(field('Número de documento'), '9001')
    await save(user)

    expect(await screen.findByText('Ingresa la razón social')).toBeInTheDocument()
    expect(screen.getByText('Ingresa la dirección')).toBeInTheDocument()
    expect(
      screen.getByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Escribe el NIT con números y, si aplica, el dígito de verificación (900123456-7)',
      ),
    ).toBeInTheDocument()
    expect(updateSupplier).not.toHaveBeenCalled()
  })

  it('asks for both names of a natural person', async () => {
    const { user } = await renderForm(naturalPerson)

    await user.clear(field('Nombres'))
    await save(user)

    expect(await screen.findByText('Ingresa los nombres')).toBeInTheDocument()
    expect(updateSupplier).not.toHaveBeenCalled()
  })
})

describe('EditSupplierForm api errors', () => {
  it.each([
    [
      new ApiError('Doc', 409, {}, 'DOCUMENT_ALREADY_IN_USE'),
      'Ese documento ya pertenece a otra persona registrada.',
    ],
    [
      new ApiError('Email', 409, {}, 'EMAIL_ALREADY_IN_USE'),
      'Ese correo ya pertenece a otra persona registrada.',
    ],
    [new ApiError('Forbidden', 403), 'No tienes permiso para editar proveedores.'],
    [new ApiError('Not found', 404), 'Este proveedor ya no existe. Recarga el listado.'],
    [new Error('boom'), 'No fue posible guardar los cambios. Intenta de nuevo.'],
  ])('shows the error (%s)', async (error, message) => {
    updateSupplier.mockRejectedValue(error)
    const { user, onUpdated } = await renderForm()

    await user.clear(field('Teléfono'))
    await user.type(field('Teléfono'), '3009998888')
    await save(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('cancels without saving', async () => {
    const { user, onCancel } = await renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(updateSupplier).not.toHaveBeenCalled()
  })
})
