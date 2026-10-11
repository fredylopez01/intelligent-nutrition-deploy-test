import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { ApiError } from '../../services/http'
import { buildCompanyCustomer, buildNaturalCustomer } from '../../test-utils/customers'

import { CustomerDetailPage } from './CustomerDetailPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/customers.service', () => ({
  customersService: { getById: vi.fn(), update: vi.fn(), updateStatus: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: auth.role } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({
    title,
    backTo,
    backLabel,
    actions,
    children,
  }: {
    title: string
    backTo?: string
    backLabel?: string
    actions?: ReactNode
    children: ReactNode
  }) => (
    <main>
      {backTo && <a href={backTo}>{backLabel}</a>}
      <h1>{title}</h1>
      {actions}
      {children}
    </main>
  ),
}))

const getCustomer = vi.mocked(customersService.getById)
const updateCustomer = vi.mocked(customersService.update)
const updateStatus = vi.mocked(customersService.updateStatus)

const laura = buildNaturalCustomer()

function renderPage(customerId = 'customer-laura', from?: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter
      initialEntries={[{ pathname: `/clientes/${customerId}`, state: from ? { from } : null }]}
    >
      <Routes>
        <Route path="/clientes/:customerId" element={<CustomerDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

function field(label: string) {
  return screen.getByLabelText(label)
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Actualizar información' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  getCustomer.mockResolvedValue(laura)
  updateCustomer.mockResolvedValue(laura)
  updateStatus.mockResolvedValue({ message: 'Customer status updated successfully.' })
})

describe('CustomerDetailPage view', () => {
  it('shows the customer profile and a way back to the list', async () => {
    renderPage('customer-laura', '/clientes?q=laura')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laura Pérez' }),
    ).toBeInTheDocument()
    expect(getCustomer).toHaveBeenCalledWith('customer-laura', 'test-token')
    expect(screen.getByRole('link', { name: 'Volver al listado de clientes' })).toHaveAttribute(
      'href',
      '/clientes?q=laura',
    )
    const profile = screen.getByRole('region', { name: 'Laura Pérez' })
    expect(within(profile).getByText('Persona natural')).toBeInTheDocument()
    expect(within(profile).getByText('CC 1049000111')).toBeInTheDocument()
    expect(within(profile).getByText('Activo')).toBeInTheDocument()
  })

  it('tells when the customer does not exist', async () => {
    getCustomer.mockRejectedValue(new ApiError('Customer not found', 404, {}, 'NOT_FOUND'))
    renderPage('missing')

    expect(await screen.findByText('Este cliente no existe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al listado' })).toHaveAttribute(
      'href',
      '/clientes',
    )
  })

  it('warns that an inactive customer cannot be used in new sales', async () => {
    getCustomer.mockResolvedValue({ ...laura, active: false })
    renderPage()

    expect(
      await screen.findByText(
        'Este cliente está inactivo: conserva su historial, pero no se puede usar en ventas nuevas.',
      ),
    ).toBeInTheDocument()
  })
})

describe('CustomerDetailPage update', () => {
  it('loads the current data read only, with the document always locked', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Actualizar información' })

    expect(field('Tipo de documento')).toHaveValue('Cédula de Ciudadanía')
    expect(field('Número de documento')).toHaveValue('1049000111')
    expect(field('Nombres')).toHaveValue('Laura')
    expect(field('Correo electrónico')).toHaveValue('laura@correo.com')
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
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  it('enables the editable fields but keeps the document read only', async () => {
    const { user } = renderPage()

    await startEditing(user)

    for (const label of ['Nombres', 'Apellidos', 'Correo electrónico', 'Teléfono', 'Dirección']) {
      expect(field(label)).not.toHaveAttribute('readonly')
    }
    expect(field('Tipo de documento')).toHaveAttribute('readonly')
    expect(field('Número de documento')).toHaveAttribute('readonly')
    expect(field('Nombres')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('sends only the changed fields and confirms', async () => {
    const updated = buildNaturalCustomer({
      person: { ...laura.person, phone: '3127778899', email: 'laura.p@correo.com' },
    })
    updateCustomer.mockResolvedValue(updated)
    const { user } = renderPage()
    await startEditing(user)

    await user.clear(field('Teléfono'))
    await user.type(field('Teléfono'), '3127778899')
    await user.clear(field('Correo electrónico'))
    await user.type(field('Correo electrónico'), ' Laura.P@Correo.com ')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-laura',
      { person: { email: 'laura.p@correo.com', phone: '3127778899' } },
      'test-token',
    )
    expect(await screen.findByText('Cliente actualizado exitosamente.')).toBeInTheDocument()
    await waitFor(() => expect(getCustomer).toHaveBeenCalledTimes(2))
    expect(field('Teléfono')).toHaveAttribute('readonly')
  })

  it('edits the business name of a company', async () => {
    const gym = buildCompanyCustomer()
    getCustomer.mockResolvedValue(gym)
    updateCustomer.mockResolvedValue(gym)
    const { user } = renderPage('customer-gym')
    await startEditing(user)

    expect(screen.queryByLabelText('Nombres')).not.toBeInTheDocument()
    expect(field('Razón social')).toHaveFocus()
    await user.clear(field('Razón social'))
    await user.type(field('Razón social'), 'Gimnasio Fuerza Boyacá SAS')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(updateCustomer).toHaveBeenCalledWith(
      'customer-gym',
      { person: { businessName: 'Gimnasio Fuerza Boyacá SAS' } },
      'test-token',
    )
  })

  it('does not call the api when nothing changed', async () => {
    const { user } = renderPage()
    await startEditing(user)

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios por guardar.')
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('validates before saving', async () => {
    const { user } = renderPage()
    await startEditing(user)

    await user.clear(field('Nombres'))
    await user.clear(field('Teléfono'))
    await user.type(field('Teléfono'), '300-111')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('Ingresa los nombres')).toBeInTheDocument()
    expect(
      screen.getByText('El teléfono solo lleva números, entre 7 y 15 dígitos'),
    ).toBeInTheDocument()
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('discards the changes when cancelled', async () => {
    const { user } = renderPage()
    await startEditing(user)

    await user.clear(field('Dirección'))
    await user.type(field('Dirección'), 'Otra dirección')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(field('Dirección')).toHaveValue('Calle 20 # 10-15, Tunja')
    expect(field('Dirección')).toHaveAttribute('readonly')
    expect(updateCustomer).not.toHaveBeenCalled()
  })

  it('shows the api error and stays in edit mode', async () => {
    updateCustomer.mockRejectedValue(new ApiError('Email in use', 409, {}, 'EMAIL_ALREADY_IN_USE'))
    const { user } = renderPage()
    await startEditing(user)

    await user.clear(field('Correo electrónico'))
    await user.type(field('Correo electrónico'), 'gym@correo.com')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese correo ya pertenece a otra persona registrada. Usa un correo diferente.',
    )
    expect(field('Correo electrónico')).not.toHaveAttribute('readonly')
  })
})

describe('CustomerDetailPage state', () => {
  it('lets the superadmin deactivate from the header', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Desactivar cliente' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este cliente?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(updateStatus).toHaveBeenCalledWith('customer-laura', { active: false }, 'test-token')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'El cliente Laura Pérez quedó inactivo. Ya no se podrá usar en ventas nuevas.',
    )
    await waitFor(() => expect(getCustomer).toHaveBeenCalledTimes(2))
  })

  it('activates an inactive customer', async () => {
    getCustomer.mockResolvedValue({ ...laura, active: false })
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Activar cliente' }))
    const dialog = screen.getByRole('dialog', { name: '¿Activar este cliente?' })
    expect(dialog).toHaveTextContent(
      'Laura Pérez volverá a estar disponible para registrarle ventas.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Sí, activar' }))

    expect(updateStatus).toHaveBeenCalledWith('customer-laura', { active: true }, 'test-token')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'El cliente Laura Pérez quedó activo.',
    )
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Desactivar cliente' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(updateStatus).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the confirmation open with the api error', async () => {
    updateStatus.mockRejectedValue(
      new ApiError('Customer is already in the requested state.', 409, {}, 'ALREADY_IN_STATE'),
    )
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Desactivar cliente' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este cliente?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'El cliente ya tenía ese estado. Recarga el listado para ver su estado actual.',
    )
  })

  it('lets the branch leader deactivate, as the contract allows', async () => {
    auth.role = 'BRANCH_LEADER'
    const { user } = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Desactivar cliente' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Sí, desactivar' }),
    )

    expect(updateStatus).toHaveBeenCalledWith('customer-laura', { active: false }, 'test-token')
  })

  it('hides the state action from the branch assistant', async () => {
    auth.role = 'BRANCH_ASSISTANT'
    renderPage()

    await screen.findByRole('button', { name: 'Actualizar información' })
    expect(
      screen.queryByRole('button', { name: /Desactivar cliente|Activar cliente/ }),
    ).not.toBeInTheDocument()
  })
})
