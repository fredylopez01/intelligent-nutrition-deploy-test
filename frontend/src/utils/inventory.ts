import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'

export const INVENTORY_MANAGE_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER']

export const EXPIRING_SOON_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

const quantityFormatter = new Intl.NumberFormat('es-CO')

export function formatQuantity(quantity: number, abbreviation?: string): string {
  const value = quantityFormatter.format(quantity)
  return abbreviation ? `${value} ${abbreviation}` : value
}

const expirationFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatExpirationDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  const parts = expirationFormatter.formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')} ${part('month').replace('.', '')} ${part('year')}`
}

export function todayInputValue(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export type ExpirationState = 'expired' | 'soon' | 'ok'

export function expirationState(
  isoDate: string,
  now: Date = new Date(),
): { state: ExpirationState; days: number } {
  const expiration = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`)
  const today = Date.parse(`${todayInputValue(now)}T00:00:00Z`)
  const days = Math.round((expiration - today) / DAY_MS)
  if (days < 0) return { state: 'expired', days }
  if (days <= EXPIRING_SOON_DAYS) return { state: 'soon', days }
  return { state: 'ok', days }
}

export function expirationLabel(isoDate: string, now: Date = new Date()): string {
  const { state, days } = expirationState(isoDate, now)
  if (state === 'expired') return days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`
  if (state === 'soon') {
    if (days === 0) return 'Vence hoy'
    return days === 1 ? 'Vence mañana' : `Vence en ${days} días`
  }
  return 'Vigente'
}

export function resolveInventoryError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
    case 'BRANCH_INACTIVE':
      return 'La sede está inactiva: su inventario se puede consultar, pero no modificar.'
    case 'BRANCH_NOT_FOUND':
      return 'La sede ya no existe. Elige otra sede.'
    case 'BRANCH_OUT_OF_SCOPE':
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso al inventario de esta sede.'
    case 'PRODUCT_NOT_ASSIGNED':
      return 'Este producto ya no está asignado a la sede. Recarga el inventario.'
    case 'PRODUCT_NOT_FOUND':
      return 'El producto ya no existe. Recarga el inventario.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'No se encontró la información solicitada. Recarga la página.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}

const STOCK_PATTERN = /^\d{1,9}$/

export function stockAmountSchema(requiredMessage: string, label: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .regex(
      STOCK_PATTERN,
      `${label} debe ser un número entero de 0 en adelante, sin puntos ni comas.`,
    )
}

export const assignProductSchema = z.object({
  quantity: stockAmountSchema('Escribe la cantidad inicial del lote.', 'La cantidad'),
  minimumStock: stockAmountSchema('Escribe el stock mínimo (puede ser 0).', 'El stock mínimo'),
  expirationDate: z
    .string()
    .min(1, 'Elige la fecha de vencimiento del lote.')
    .refine(
      (value) => value >= todayInputValue(),
      'La fecha de vencimiento no puede ser anterior a hoy.',
    ),
})

export type AssignProductValues = z.infer<typeof assignProductSchema>

export function toExpirationDateTime(inputDate: string): string {
  return `${inputDate}T00:00:00Z`
}

export type AssignErrorField = 'product' | 'quantity' | 'expirationDate'

export function assignFieldError(
  error: unknown,
): { field: AssignErrorField; message: string } | null {
  if (!(error instanceof ApiError)) return null
  switch (error.code) {
    case 'PRODUCT_ALREADY_ASSIGNED':
      return {
        field: 'expirationDate',
        message:
          'Este producto ya tiene un lote con esa fecha de vencimiento en la sede. Para cambiar su cantidad usa un movimiento de inventario.',
      }
    case 'PRODUCT_INACTIVE':
      return {
        field: 'product',
        message: 'El producto está inactivo y no se puede asignar. Elige otro producto.',
      }
    case 'PRODUCT_NOT_FOUND':
      return { field: 'product', message: 'El producto ya no existe. Elige otro producto.' }
    case 'INSUFFICIENT_STOCK':
      return {
        field: 'quantity',
        message: 'No hay existencias suficientes para asignar esa cantidad.',
      }
  }
  return null
}

export const minimumStockSchema = z.object({
  minimumStock: stockAmountSchema('Escribe el stock mínimo (puede ser 0).', 'El stock mínimo'),
})

export type MinimumStockValues = z.infer<typeof minimumStockSchema>
