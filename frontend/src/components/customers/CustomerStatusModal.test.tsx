import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { customersService } from '../../services/customers.service'
import { ApiError } from '../../services/http'
import { buildCompanyCustomer, buildNaturalCustomer } from '../../test-utils/customers'
import type { Customer } from '../../types/customer'

import { CustomerStatusModal } from './CustomerStatusModal'

vi.mock('../../services/customers.service', () => ({
  customersService: { updateStatus: vi.fn() },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const updateStatus = vi.mocked(customersService.updateStatus)

const onClose = vi.fn()
const onChanged = vi.fn()

function renderModal(customer: Customer | null = buildNaturalCustomer()) {
  const user = userEvent.setup()
  const view = render(
    <CustomerStatusModal customer={customer} onClose={onClose} onChanged={onChanged} />,
  )
  const reopen = (next: Customer | null) =>
    view.rerender(<CustomerStatusModal customer={next} onClose={onClose} onChanged={onChanged} />)
  return { user, reopen }
}

function dialog() {
  return screen.getByRole('dialog')
}

function deferStatusRequest() {
  let resolve!: () => void
  updateStatus.mockReturnValue(
    new Promise<{ message: string }>((done) => {
      resolve = () => done({ message: 'Customer status updated successfully.' })
    }),
  )
  return { resolve: () => resolve() }
}

beforeEach(() => {
  vi.resetAllMocks()
  updateStatus.mockResolvedValue({ message: 'Customer status updated successfully.' })
})

describe('CustomerStatusModal confirmation', () => {
  it('stays closed while there is no customer selected', () => {
    renderModal(null)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks to deactivate an active customer and explains the effect', () => {
    renderModal(buildNaturalCustomer())

    const modal = dialog()
    expect(within(modal).getByRole('heading', { name: '¿Desactivar este cliente?' })).toBeVisible()
    expect(modal).toHaveAccessibleDescription(
      'Laura Pérez no podrá usarse en ventas nuevas. Su historial y sus datos se conservan.',
    )
    expect(within(modal).getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled()
    expect(within(modal).getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(within(modal).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('asks to activate an inactive customer and explains the effect', () => {
    renderModal(buildCompanyCustomer({ active: false }))

    const modal = dialog()
    expect(within(modal).getByRole('heading', { name: '¿Activar este cliente?' })).toBeVisible()
    expect(modal).toHaveAccessibleDescription(
      'Gimnasio Fuerza SAS volverá a estar disponible para registrarle ventas.',
    )
    expect(within(modal).getByRole('button', { name: 'Sí, activar' })).toBeEnabled()
    expect(within(modal).queryByRole('button', { name: 'Sí, desactivar' })).not.toBeInTheDocument()
  })

  it('marks the deactivation as a destructive action and the activation as a primary one', () => {
    const { reopen } = renderModal(buildNaturalCustomer())
    expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toHaveClass('ui-button--danger')

    reopen(buildNaturalCustomer({ active: false }))
    expect(screen.getByRole('button', { name: 'Sí, activar' })).toHaveClass('ui-button--primary')
  })

  it('does not call the api until the user confirms', () => {
    renderModal()

    expect(updateStatus).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('CustomerStatusModal confirm', () => {
  it('deactivates an active customer and reports the new state', async () => {
    const customer = buildNaturalCustomer()
    const { user } = renderModal(customer)

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(updateStatus).toHaveBeenCalledTimes(1)
    expect(updateStatus).toHaveBeenCalledWith('customer-laura', { active: false }, 'test-token')
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(customer, false))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('activates an inactive customer and reports the new state', async () => {
    const customer = buildCompanyCustomer({ active: false })
    const { user } = renderModal(customer)

    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(updateStatus).toHaveBeenCalledWith('customer-gym', { active: true }, 'test-token')
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(customer, true))
  })

  it('leaves closing to the parent once the change succeeds', async () => {
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('CustomerStatusModal saving', () => {
  it('shows the progress and blocks both buttons while the request runs', async () => {
    const request = deferStatusRequest()
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    const saving = await screen.findByRole('button', { name: 'Guardando...' })
    expect(saving).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(onChanged).not.toHaveBeenCalled()

    request.resolve()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('sends a single request when the confirmation is clicked twice', async () => {
    const request = deferStatusRequest()
    const { user } = renderModal()

    const confirm = screen.getByRole('button', { name: 'Sí, desactivar' })
    await user.click(confirm)
    await user.click(await screen.findByRole('button', { name: 'Guardando...' }))

    expect(updateStatus).toHaveBeenCalledTimes(1)
    request.resolve()
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('cannot be dismissed while the request runs', async () => {
    const request = deferStatusRequest()
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
    await screen.findByRole('button', { name: 'Guardando...' })

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Cerrar diálogo' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar', hidden: true }))

    expect(onClose).not.toHaveBeenCalled()
    request.resolve()
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })
})

describe('CustomerStatusModal dismiss', () => {
  it('closes without calling the api from the cancel button', async () => {
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(updateStatus).not.toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('closes with the Escape key', async () => {
    const { user } = renderModal()

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('closes with the x button', async () => {
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cerrar diálogo' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('closes when the backdrop is clicked', async () => {
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cerrar', hidden: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(updateStatus).not.toHaveBeenCalled()
  })
})

describe('CustomerStatusModal errors', () => {
  async function confirmFailing(error: unknown) {
    updateStatus.mockRejectedValue(error)
    const view = renderModal()
    await view.user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
    return view
  }

  it('tells when the customer already had that state', async () => {
    await confirmFailing(
      new ApiError('Customer is already in the requested state.', 409, {}, 'ALREADY_IN_STATE'),
    )

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'El cliente ya tenía ese estado. Recarga el listado para ver su estado actual.',
    )
  })

  it('tells when the role has no permission', async () => {
    await confirmFailing(new ApiError('Forbidden', 403, {}, 'FORBIDDEN'))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No tienes permiso para realizar esta acción.',
    )
  })

  it('tells when the customer no longer exists', async () => {
    await confirmFailing(new ApiError('Customer not found', 404, {}, 'NOT_FOUND'))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'El cliente o la persona ya no existe o está inactiva. Recarga e intenta de nuevo.',
    )
  })

  it('falls back to a generic message on a server error', async () => {
    await confirmFailing(new ApiError('Internal error', 500, {}, 'INTERNAL_ERROR'))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No fue posible cambiar el estado del cliente. Intenta de nuevo.',
    )
  })

  it('falls back to a generic message when the network fails', async () => {
    await confirmFailing(new TypeError('Failed to fetch'))

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
      'No fue posible cambiar el estado del cliente. Intenta de nuevo.',
    )
  })

  it('stays open, unlocked and without reporting a change', async () => {
    await confirmFailing(new ApiError('Internal error', 500, {}, 'INTERNAL_ERROR'))

    await within(dialog()).findByRole('alert')
    expect(screen.getByRole('button', { name: 'Sí, desactivar' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled()
    expect(onChanged).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears the error and succeeds when the user retries', async () => {
    updateStatus.mockRejectedValueOnce(new ApiError('Internal error', 500, {}, 'INTERNAL_ERROR'))
    const { user } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
    await within(dialog()).findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
    expect(updateStatus).toHaveBeenCalledTimes(2)
    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show a previous error after cancelling and opening again', async () => {
    updateStatus.mockRejectedValue(new ApiError('Internal error', 500, {}, 'INTERNAL_ERROR'))
    const { user, reopen } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))
    await within(dialog()).findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    reopen(null)
    reopen(buildNaturalCustomer())

    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument()
  })
})
