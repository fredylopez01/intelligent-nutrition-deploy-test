import type {
  AppNotification,
  NotificationsListParams,
  NotificationsListResponse,
} from '../types/notification'

import { http } from './http'

const NOTIFICATIONS_PATH = '/notifications'

function buildQuery(params: NotificationsListParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const notificationsService = {
  list: (params: NotificationsListParams, token: string | null) =>
    http.get<NotificationsListResponse>(`${NOTIFICATIONS_PATH}${buildQuery(params)}`, { token }),

  unreadCount: (token: string | null) =>
    http.get<{ unread: number }>(`${NOTIFICATIONS_PATH}/unread-count`, { token }),

  markRead: (notificationId: string, token: string | null) =>
    http.patch<AppNotification>(`${NOTIFICATIONS_PATH}/${notificationId}/read`, undefined, {
      token,
    }),

  markAllRead: (token: string | null) =>
    http.post<{ updated: number }>(`${NOTIFICATIONS_PATH}/read-all`, undefined, { token }),
}
