import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import type { Supplier } from '../../types/supplier'

import { EditSupplierForm } from './EditSupplierForm'

const mocks = vi.hoisted(() => ({
  token: 'test-token',
  update: vi.fn(),
  onUpdated: vi.fn(),
  onCancel: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: mocks.token }),
}))

vi.mock('../../services/suppliers.service', () => ({
  suppliersService: { update: mocks.update },
}))

const supplier: Supplier = {
  id: 'supplier-1',
  commercialName: 'Suplementos Norte',
  person: {
    businessName: 'Suplementos Norte SAS',
    documentNumber: '900123456',
    documentType: { code: 'NIT', name: 'NIT' },
    email: 'contacto@norte.test',
    phone: '3001112222',
    address: 'Calle 10 # 20-30',
    active: true,
  },
}

function renderForm() {
  return render(
    <EditSupplierForm supplier={supplier} onUpdated={mocks.onUpdated} onCancel={mocks.onCancel} />,
  )
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
}

describe('EditSupplierForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({})
  })

  it('does not render any field to edit the identity document', () => {
    renderForm()

    expect(screen.queryByLabelText(/documento/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/número de documento/i)).not.toBeInTheDocument()
    expect(screen.getAllByRole('textbox')).toHaveLength(3)
    expect(
      screen.getByText(/Solo se pueden editar el nombre comercial, el teléfono y la dirección de/),
    ).toBeInTheDocument()
  })

  it('loads the current values of the editable fields', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre comercial')).toHaveValue('Suplementos Norte')
    expect(screen.getByLabelText('Teléfono')).toHaveValue('3001112222')
    expect(screen.getByLabelText('Dirección')).toHaveValue('Calle 10 # 20-30')
  })

  it('sends only the changed fields and calls onUpdated on success', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3009998888')
    await save(user)

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update).toHaveBeenCalledWith('supplier-1', { phone: '3009998888' }, mocks.token)
    const payload = mocks.update.mock.calls[0][1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('documentNumber')
    expect(payload).not.toHaveProperty('documentTypeId')
    await waitFor(() => expect(mocks.onUpdated).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not call the service when there are no changes', async () => {
    const user = userEvent.setup()
    renderForm()

    await save(user)

    expect(await screen.findByText('No hay cambios por guardar.')).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.onUpdated).not.toHaveBeenCalled()
  })

  it('shows an inline error when a field is emptied', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await save(user)

    expect(await screen.findByText('Ingresa el teléfono')).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a phone with letters and does not save', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '300abc')
    await save(user)

    expect(
      await screen.findByText('El teléfono solo puede contener números, sin espacios ni símbolos'),
    ).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('shows the permission message when the API responds 403', async () => {
    mocks.update.mockRejectedValue(new ApiError('Forbidden', 403))
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3009998888')
    await save(user)

    expect(
      await screen.findByText('No tienes permiso para editar proveedores.'),
    ).toBeInTheDocument()
    expect(mocks.onUpdated).not.toHaveBeenCalled()
  })

  it('shows the missing supplier message when the API responds 404', async () => {
    mocks.update.mockRejectedValue(new ApiError('Not Found', 404))
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3009998888')
    await save(user)

    expect(
      await screen.findByText('Este proveedor ya no existe. Recarga el listado.'),
    ).toBeInTheDocument()
    expect(mocks.onUpdated).not.toHaveBeenCalled()
  })

  it('shows a generic message for an unexpected error', async () => {
    mocks.update.mockRejectedValue(new Error('network down'))
    const user = userEvent.setup()
    renderForm()

    await user.clear(screen.getByLabelText('Teléfono'))
    await user.type(screen.getByLabelText('Teléfono'), '3009998888')
    await save(user)

    expect(
      await screen.findByText('No fue posible guardar los cambios. Intenta de nuevo.'),
    ).toBeInTheDocument()
    expect(mocks.onUpdated).not.toHaveBeenCalled()
  })

  it('calls onCancel without saving when the user cancels', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(mocks.onCancel).toHaveBeenCalledTimes(1)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
