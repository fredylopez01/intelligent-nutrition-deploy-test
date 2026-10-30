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

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Notificaciones, / }))
  return within(screen.getByRole('dialog', { name: 'Notificaciones' }))
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

  it('hides the badge when there is nothing unread', async () => {
    unreadCount.mockResolvedValue({ unread: 0 })
    const user = userEvent.setup()
    render(<NotificationsPanel />)

    expect(
      await screen.findByRole('button', { name: 'Notificaciones, ninguna sin leer' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()

    const panel = await openPanel(user)
    expect(panel.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled()
  })

  it('caps the badge at 99 plus', async () => {
    unreadCount.mockResolvedValue({ unread: 120 })
    render(<NotificationsPanel />)

    expect(
      await screen.findByRole('button', { name: 'Notificaciones, 120 sin leer' }),
    ).toBeInTheDocument()
    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  it('opens the unread notifications with their type', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)

    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    const panel = within(screen.getByRole('dialog', { name: 'Notificaciones' }))
    expect(await panel.findByText('Inventario bajo')).toBeInTheDocument()
    expect(panel.getByText('Cierre sin confirmar')).toBeInTheDocument()
    expect(panel.getByRole('tab', { name: 'Sin leer (2)' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(panel.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'false')
    expect(panel.getAllByText('hace un momento')).toHaveLength(2)
    expect(panel.getAllByRole('button', { name: /\. Marcar como leída$/ })).toHaveLength(2)
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 15, read: false }, 'test-token')
  })

  it('closes when clicking outside', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await openPanel(user)

    await user.click(document.body)

    expect(screen.queryByRole('dialog', { name: 'Notificaciones' })).not.toBeInTheDocument()
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

  it('keeps a notification visible after reading it in the all tab', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    const panel = await openPanel(user)
    await user.click(panel.getByRole('tab', { name: 'Todas' }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 15 }, 'test-token'))

    await user.click(
      await screen.findByRole('button', { name: /Whey Protein 2 lb está por debajo/ }),
    )

    expect(markRead).toHaveBeenCalledWith('n-1', 'test-token')
    expect(
      screen.getByRole('button', { name: /Whey Protein 2 lb está por debajo/ }),
    ).not.toHaveAccessibleName(/Marcar como leída/)
  })

  it('leaves an already read notification alone', async () => {
    list.mockResolvedValue(page([notification({ read: true })]))
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    const panel = await openPanel(user)
    await user.click(panel.getByRole('tab', { name: 'Todas' }))

    const item = await screen.findByRole('button', {
      name: 'Inventario bajo: Whey Protein 2 lb está por debajo del mínimo en Centro (3 de 5).',
    })
    await user.click(item)

    expect(markRead).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument()
  })

  it('reloads the list when marking one fails', async () => {
    markRead.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await openPanel(user)
    const refreshes = unreadCount.mock.calls.length

    await user.click(
      await screen.findByRole('button', { name: /Whey Protein 2 lb está por debajo/ }),
    )

    await waitFor(() => expect(unreadCount).toHaveBeenCalledTimes(refreshes + 1))
    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 15, read: false }, 'test-token')
    expect(await screen.findByText(/Whey Protein 2 lb está por debajo/)).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled()
  })

  it('refreshes the counter when marking all fails', async () => {
    markAllRead.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    const panel = await openPanel(user)
    await screen.findByText('Inventario bajo')
    const refreshes = unreadCount.mock.calls.length

    await user.click(panel.getByRole('button', { name: 'Marcar todas como leídas' }))

    await waitFor(() => expect(unreadCount).toHaveBeenCalledTimes(refreshes + 1))
    expect(screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument()
  })

  it('shows every notification in the second tab', async () => {
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    await user.click(await screen.findByRole('button', { name: /Notificaciones, 2 sin leer/ }))

    await user.click(screen.getByRole('tab', { name: 'Todas' }))

    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 15 }, 'test-token'))
  })

  it('explains an empty unread list', async () => {
    list.mockResolvedValue(page([]))
    const user = userEvent.setup()
    render(<NotificationsPanel />)

    const panel = await openPanel(user)

    expect(
      await panel.findByText('Estás al día: no tienes notificaciones sin leer.'),
    ).toBeInTheDocument()
  })

  it('explains an empty list in the all tab', async () => {
    list.mockResolvedValue(page([]))
    const user = userEvent.setup()
    render(<NotificationsPanel />)
    const panel = await openPanel(user)

    await user.click(panel.getByRole('tab', { name: 'Todas' }))

    expect(await panel.findByText('Todavía no tienes notificaciones.')).toBeInTheDocument()
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
