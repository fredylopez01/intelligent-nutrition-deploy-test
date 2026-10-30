import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../services/http'
import { paymentMethodsService } from '../../services/paymentMethods.service'
import { CASH, NEQUI, OTHER, paymentMethodsPage } from '../../test-utils/paymentMethods'

import { PaymentMethodsPage } from './PaymentMethodsPage'

const auth = vi.hoisted(() => ({ role: 'SUPERADMIN' }))

vi.mock('../../services/paymentMethods.service', () => ({
  paymentMethodsService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'me', role: { name: auth.role } } }),
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))

const listMethods = vi.mocked(paymentMethodsService.list)

function renderPage(path = '/pos/metodos-pago') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <PaymentMethodsPage />
    </MemoryRouter>,
  )
  return { user }
}

beforeEach(() => {
  vi.resetAllMocks()
  auth.role = 'SUPERADMIN'
  listMethods.mockResolvedValue(paymentMethodsPage([CASH, NEQUI, OTHER]))
})

const updateMethod = vi.mocked(paymentMethodsService.update)
const updateStatus = vi.mocked(paymentMethodsService.updateStatus)

describe('PaymentMethodsPage edit and state', () => {
  it('edits the name from the actions menu and keeps the code locked', async () => {
    updateMethod.mockResolvedValue({ ...NEQUI, name: 'Nequi QR' })
    const { user } = renderPage()
    await screen.findByText('Nequi')

    await user.click(screen.getByRole('button', { name: 'Acciones para Nequi' }))
    await user.click(screen.getByRole('menuitem', { name: 'Editar nombre' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar método de pago' }))
    expect(dialog.queryByLabelText('Código')).not.toBeInTheDocument()
    expect(dialog.getByText('NEQUI')).toBeInTheDocument()
    await user.clear(dialog.getByLabelText('Nombre'))
    await user.type(dialog.getByLabelText('Nombre'), 'Nequi QR')
    await user.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('El método NEQUI ahora se llama Nequi QR.')).toBeInTheDocument()
    expect(updateMethod).toHaveBeenCalledWith('pm-nequi', { name: 'Nequi QR' }, 'test-token')
  })

  it('warns that the point of sale stops offering a deactivated method', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Efectivo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este método de pago?' })
    expect(dialog).toHaveTextContent('Las ventas que ya se pagaron con él lo conservan.')
    expect(updateStatus).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Sí, desactivar' }))

    expect(
      await screen.findByText('Efectivo quedó inactivo: ya no aparece en el punto de venta.'),
    ).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('pm-cash', { active: false }, 'test-token')
  })

  it('activates an inactive method', async () => {
    updateStatus.mockResolvedValue({ message: 'ok' })
    const { user } = renderPage()
    await screen.findByText('Otro')

    await user.click(screen.getByRole('button', { name: 'Acciones para Otro' }))
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, activar' }))

    expect(
      await screen.findByText('Otro quedó activo y vuelve a aparecer en el punto de venta.'),
    ).toBeInTheDocument()
    expect(updateStatus).toHaveBeenCalledWith('pm-other', { active: true }, 'test-token')
  })

  it('keeps the confirmation open with the api error', async () => {
    updateStatus.mockRejectedValue(new ApiError('State', 409, {}, 'ALREADY_IN_STATE'))
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Efectivo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    await user.click(screen.getByRole('button', { name: 'Sí, desactivar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El método de pago ya tenía ese estado. Recarga el listado para ver su estado actual.',
    )
    expect(
      screen.getByRole('dialog', { name: '¿Desactivar este método de pago?' }),
    ).toBeInTheDocument()
  })

  it('closes the deactivation dialog without changing the state', async () => {
    const { user } = renderPage()
    await screen.findByText('Efectivo')

    await user.click(screen.getByRole('button', { name: 'Acciones para Efectivo' }))
    await user.click(screen.getByRole('menuitem', { name: 'Desactivar' }))
    const dialog = screen.getByRole('dialog', { name: '¿Desactivar este método de pago?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '¿Desactivar este método de pago?' }),
      ).not.toBeInTheDocument(),
    )
    expect(updateStatus).not.toHaveBeenCalled()
  })

  it('asks for confirmation with the reactivation copy for an inactive method', async () => {
    const { user } = renderPage()
    await screen.findByText('Otro')

    await user.click(screen.getByRole('button', { name: 'Acciones para Otro' }))
    await user.click(screen.getByRole('menuitem', { name: 'Activar' }))

    const dialog = screen.getByRole('dialog', { name: '¿Activar este método de pago?' })
    expect(dialog).toHaveTextContent('Otro volverá a aparecer en el punto de venta para cobrar.')
    expect(updateStatus).not.toHaveBeenCalled()
  })
})
