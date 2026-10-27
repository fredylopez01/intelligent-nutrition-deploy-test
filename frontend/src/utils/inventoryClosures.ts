import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { ClosureItem } from '../types/inventoryClosure'

export const CLOSURE_COUNT_ROLES: RoleName[] = ['BRANCH_LEADER', 'BRANCH_ASSISTANT']
export const CLOSURE_OBSERVATION_MAX_LENGTH = 500

const BUSINESS_TIME_ZONE = 'America/Bogota'

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function businessToday(now: Date = new Date()): string {
  return businessDateFormatter.format(now)
}

const longDateFormatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

export function formatClosureDay(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return isoDate
  return longDateFormatter.format(date)
}

export function lotKey(item: Pick<ClosureItem, 'productId' | 'expirationDate'>): string {
  return `${item.productId}|${item.expirationDate ?? ''}`
}

export const COUNT_PATTERN = /^\d{1,9}$/

export function countError(value: string): string | null {
  if (value.trim() === '') return null
  return COUNT_PATTERN.test(value.trim())
    ? null
    : 'Escribe un número entero de 0 en adelante, sin puntos ni comas.'
}

export function resolveClosureError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'CLOSURE_ALREADY_EXISTS':
      return 'La sede ya tiene un cierre para hoy. Recarga para continuar con ese conteo.'
    case 'CLOSURE_LOCKED':
      return 'El cierre ya se confirmó o se bloqueó: los conteos no se pueden cambiar. Si hay una diferencia, el superadmin puede registrar un ajuste.'
    case 'PRODUCT_NOT_IN_CLOSURE':
      return 'Uno de los lotes ya no pertenece al cierre. Recarga la página.'
    case 'BRANCH_INACTIVE':
      return 'La sede está inactiva: no se puede iniciar el cierre.'
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso a esta sede.'
    case 'BRANCH_REQUIRED':
      return 'Elige una sede para ver sus cierres.'
    case 'CLOSURE_NOT_FOUND':
      return 'El cierre ya no existe. Recarga la página.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
