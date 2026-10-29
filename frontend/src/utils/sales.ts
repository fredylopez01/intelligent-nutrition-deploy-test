import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { SaleStatus } from '../types/sale'

export const SALE_REGISTER_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT']
export const SALE_REVERSE_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER', 'BRANCH_ASSISTANT']
export const REVERSAL_REASON_MIN_LENGTH = 10
export const REVERSAL_REASON_MAX_LENGTH = 500

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  COMPLETED: 'Completada',
  REVERSED: 'Reversada',
}

export const SALE_STATUS_TONES: Record<SaleStatus, string> = {
  COMPLETED: 'activo',
  REVERSED: 'inactivo',
}

export const reverseSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(
      REVERSAL_REASON_MIN_LENGTH,
      `Explica el motivo con al menos ${REVERSAL_REASON_MIN_LENGTH} caracteres.`,
    )
    .max(REVERSAL_REASON_MAX_LENGTH, 'El motivo no puede superar 500 caracteres.'),
})

export type ReverseSaleValues = z.infer<typeof reverseSaleSchema>

export function toCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function selectionTotalCents(
  lines: { product: { price: string }; quantity: number }[],
): number {
  return lines.reduce((sum, line) => sum + toCents(line.product.price) * line.quantity, 0)
}

export interface StockShortage {
  productName: string
  requested: number
  available: number
}

export function stockShortages(error: unknown): StockShortage[] {
  if (!(error instanceof ApiError) || error.code !== 'INSUFFICIENT_STOCK') return []
  const details = error.details as { items?: StockShortage[] } | undefined
  return details?.items ?? []
}

export function resolveSaleError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'INSUFFICIENT_STOCK':
      return 'Ya no hay unidades suficientes de algunos productos. Ajusta las cantidades de la venta.'
    case 'PAYMENT_TOTAL_MISMATCH':
      return 'El total cambió porque se actualizó un precio. Recarga los productos y vuelve a intentar.'
    case 'INVENTORY_CLOSED':
      return 'El inventario de la sede ya se cerró hoy: no se pueden registrar más ventas hasta mañana.'
    case 'PAYMENT_METHOD_INACTIVE':
    case 'PAYMENT_METHOD_NOT_FOUND':
      return 'El método de pago ya no está disponible. Elige otro.'
    case 'PRODUCT_INACTIVE':
    case 'PRODUCT_NOT_FOUND':
      return 'Uno de los productos ya no se puede vender. Quítalo de la venta y vuelve a intentar.'
    case 'BRANCH_INACTIVE':
      return 'La sede está inactiva: no puede registrar ventas.'
    case 'SALE_ALREADY_REVERSED':
      return 'Esta venta ya fue reversada. Recarga el listado para ver su estado.'
    case 'SALE_DAY_CLOSED':
      return 'El inventario del día de esta venta ya se cerró, así que no se puede reversar. El superadmin puede corregirlo con un ajuste en Movimientos.'
    case 'SALE_NOT_FOUND':
      return 'La venta ya no existe. Recarga el listado.'
    case 'SALE_REVERSAL_NO_INVENTORY':
      return 'Uno de los productos ya no está asignado a la sede, así que no se puede devolver su stock.'
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso a esta sede.'
    case 'BRANCH_REQUIRED':
      return 'Elige una sede para ver sus ventas.'
    case 'BRANCH_NOT_FOUND':
      return 'La sede ya no existe. Recarga la página.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
