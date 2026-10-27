import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { notificationsService } from './notifications.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('notificationsService', () => {
  it('lists my notifications with the read and type filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await notificationsService.list({ page: 1, limit: 15, read: false, type: 'LOW_STOCK' }, 't')

    expect(http.get).toHaveBeenCalledWith(
      '/notifications?page=1&limit=15&read=false&type=LOW_STOCK',
      { token: 't' },
    )
  })

  it('reads the unread counter', async () => {
    vi.mocked(http.get).mockResolvedValue({ unread: 3 })

    await expect(notificationsService.unreadCount('t')).resolves.toEqual({ unread: 3 })
    expect(http.get).toHaveBeenCalledWith('/notifications/unread-count', { token: 't' })
  })

  it('marks one or all notifications as read', async () => {
    vi.mocked(http.patch).mockResolvedValue({})
    vi.mocked(http.post).mockResolvedValue({ updated: 2 })

    await notificationsService.markRead('n-1', 't')
    await notificationsService.markAllRead('t')

    expect(http.patch).toHaveBeenCalledWith('/notifications/n-1/read', undefined, { token: 't' })
    expect(http.post).toHaveBeenCalledWith('/notifications/read-all', undefined, { token: 't' })
  })
})
