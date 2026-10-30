import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { notificationsService } from '../../services/notifications.service'
import type { AppNotification } from '../../types/notification'
import { NOTIFICATION_TYPE_LABELS, timeAgo, unreadBadge } from '../../utils/notifications'

import './NotificationsPanel.css'

const POLL_INTERVAL_MS = 60_000
const PANEL_LIMIT = 15

type Filter = 'all' | 'unread'

interface ListState {
  status: 'loading' | 'success' | 'error'
  items: AppNotification[]
}

export function NotificationsPanel() {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState<Filter>('unread')
  const [list, setList] = useState<ListState>({ status: 'loading', items: [] })
  const [reloadToken, setReloadToken] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(() => {
    notificationsService
      .unreadCount(token)
      .then((result) => setUnread(result.unread))
      .catch(() => undefined)
  }, [token])

  useEffect(() => {
    refreshCount()
    const timer = window.setInterval(refreshCount, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refreshCount])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    notificationsService
      .list({ page: 1, limit: PANEL_LIMIT, ...(filter === 'unread' ? { read: false } : {}) }, token)
      .then((response) => {
        if (!cancelled) setList({ status: 'success', items: response.data })
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'error', items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [open, filter, token, reloadToken])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const toggle = () => {
    if (!open) {
      setList({ status: 'loading', items: [] })
      refreshCount()
    }
    setOpen((value) => !value)
  }

  const changeFilter = (next: Filter) => {
    if (next === filter) return
    setList({ status: 'loading', items: [] })
    setFilter(next)
  }

  const markRead = async (notification: AppNotification) => {
    if (notification.read) return
    setList((current) => ({
      ...current,
      items:
        filter === 'unread'
          ? current.items.filter((item) => item.id !== notification.id)
          : current.items.map((item) =>
              item.id === notification.id ? { ...item, read: true } : item,
            ),
    }))
    setUnread((value) => Math.max(0, value - 1))
    try {
      await notificationsService.markRead(notification.id, token)
    } catch {
      refreshCount()
      setReloadToken((value) => value + 1)
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsService.markAllRead(token)
      setUnread(0)
      setList((current) => ({
        ...current,
        items: filter === 'unread' ? [] : current.items.map((item) => ({ ...item, read: true })),
      }))
    } catch {
      refreshCount()
    }
  }

  return (
    <div className="notifications" ref={containerRef}>
      <button
        type="button"
        className="notifications__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones, ninguna sin leer'
        }
        onClick={toggle}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="notifications__badge" aria-hidden="true">
            {unreadBadge(unread)}
          </span>
        )}
      </button>

      {open && (
        <div className="notifications__panel" role="dialog" aria-label="Notificaciones">
          <div className="notifications__head">
            <p className="notifications__title">Notificaciones</p>
            <button
              type="button"
              className="notifications__link"
              onClick={() => void markAllRead()}
              disabled={unread === 0}
            >
              Marcar todas como leídas
            </button>
          </div>
          <div className="notifications__tabs" role="tablist" aria-label="Filtrar notificaciones">
            {(['unread', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={`notifications__tab${filter === value ? ' notifications__tab--active' : ''}`}
                onClick={() => changeFilter(value)}
              >
                {value === 'unread' ? `Sin leer (${unread})` : 'Todas'}
              </button>
            ))}
          </div>

          {list.status === 'loading' && (
            <p className="notifications__empty" role="status">
              Cargando notificaciones...
            </p>
          )}
          {list.status === 'error' && (
            <p className="notifications__empty" role="alert">
              No fue posible cargar las notificaciones.{' '}
              <button
                type="button"
                className="notifications__link"
                onClick={() => setReloadToken((value) => value + 1)}
              >
                Reintentar
              </button>
            </p>
          )}
          {list.status === 'success' && list.items.length === 0 && (
            <p className="notifications__empty">
              {filter === 'unread'
                ? 'Estás al día: no tienes notificaciones sin leer.'
                : 'Todavía no tienes notificaciones.'}
            </p>
          )}
          {list.status === 'success' && list.items.length > 0 && (
            <ul className="notifications__list">
              {list.items.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`notifications__item${notification.read ? '' : ' notifications__item--unread'}`}
                    onClick={() => void markRead(notification)}
                    aria-label={`${notification.title}: ${notification.message}${notification.read ? '' : '. Marcar como leída'}`}
                  >
                    <span
                      className={`notifications__type notifications__type--${notification.type.toLowerCase()}`}
                    >
                      {NOTIFICATION_TYPE_LABELS[notification.type]}
                    </span>
                    <span className="notifications__message">{notification.message}</span>
                    <span className="notifications__time">{timeAgo(notification.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
