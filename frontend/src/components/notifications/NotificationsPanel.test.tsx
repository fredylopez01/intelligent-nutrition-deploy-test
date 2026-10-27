import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { notificationsService } from '../../services/notifications.service'
import type { AppNotification } from '../../types/notification'

import { NotificationsPanel } from './NotificationsPanel'

vi.mock('../../services/notifications.service', () => ({
  notificationsService: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const list = vi.mocked(notificationsService.list)
const unreadCount = vi.mocked(notificationsService.unreadCount)
const markRead = vi.mocked(notificationsService.markRead)
const markAllRead = vi.mocked(notificationsService.markAllRead)

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n-1',
    type: 'LOW_STOCK',
    title: 'Inventario bajo',
    message: 'Whey Protein 2 lb está por debajo del mínimo en Centro (3 de 5).',
    branchId: 'branch-centro',
    productId: 'product-whey',
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function page(data: AppNotification[]) {
  return { data, meta: { page: 1, limit: 15, total: data.length, totalPages: 1 } }
}

beforeEach(() => {
  vi.resetAllMocks()
  unreadCount.mockResolvedValue({ unread: 2 })
  list.mockResolvedValue(
    page([
      notification(),
      notification({
        id: 'n-2',
        type: 'CLOSURE_NOT_CONFIRMED',
        title: 'Cierre sin confirmar',
        message: 'El cierre del 2026-10-25 en Centro no se confirmó.',
      }),
    ]),
  )
  markRead.mockResolvedValue(notification({ read: true }))
  markAllRead.mockResolvedValue({ updated: 2 })
})

describe('NotificationsPanel', () => {
  it('shows the unread counter on the bell', async () => {
    render(<NotificationsPanel />)

    expect(
      await screen.findByRole('button', { name: 'Notificaciones, 2 sin leer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('opens the unread notifications with their type', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)

    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    const panel = within(screen.getByRole('dialog', { name: 'Notificaciones' }))
    expect(await panel.findByText('Inventario bajo')).toBeInTheDocument()
    expect(panel.getByText('Cierre sin confirmar')).toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 15, read: false }, 'test-token')
  })

  it('marks one notification as read and lowers the counter', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    await user.click(
      await screen.findByRole('button', { name: /Whey Protein 2 lb está por debajo/ }),
    )

    expect(markRead).toHaveBeenCalledWith('n-1', 'test-token')
    expect(screen.getByRole('button', { name: 'Notificaciones, 1 sin leer' })).toBeInTheDocument()
    expect(screen.queryByText(/Whey Protein 2 lb está por debajo/)).not.toBeInTheDocument()
  })

  it('marks every notification as read', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))
    await screen.findByText('Inventario bajo')

    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Notificaciones, ninguna sin leer' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Estás al día: no tienes notificaciones sin leer.')).toBeInTheDocument()
  })

  it('shows every notification in the second tab', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    await user.click(screen.getByRole('tab', { name: 'Todas' }))

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 15 }, 'test-token'))
  })

  it('closes with Escape', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Notificaciones' })).not.toBeInTheDocument()
  })

  it('offers to retry when the list fails', async () => {
    list.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Inventario bajo')).toBeInTheDocument()
  })
})
