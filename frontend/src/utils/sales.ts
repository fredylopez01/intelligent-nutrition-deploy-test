import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { SaleStatus } from '../types/sale'

export const SALE_REGISTER_ROLES: RoleName[] = ['BRANCH_LEADER', 'BRANCH_ASSISTANT']
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

export function resolveSaleError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
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
