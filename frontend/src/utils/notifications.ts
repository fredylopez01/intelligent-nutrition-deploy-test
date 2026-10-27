import type { NotificationType } from '../types/notification'

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  LOW_STOCK: 'Inventario bajo',
  CLOSURE_NOT_CONFIRMED: 'Cierre sin confirmar',
  PURCHASE_PENDING_RECEIPT: 'Compra pendiente',
}

const relativeFormatter = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]

export function timeAgo(isoDate: string, now: Date = new Date()): string {
  const elapsed = new Date(isoDate).getTime() - now.getTime()
  if (Number.isNaN(elapsed)) return ''
  for (const [unit, size] of UNITS) {
    if (Math.abs(elapsed) >= size || unit === 'minute') {
      const value = Math.round(elapsed / size)
      return value === 0 ? 'hace un momento' : relativeFormatter.format(value, unit)
    }
  }
  return ''
}

export function unreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count)
}
