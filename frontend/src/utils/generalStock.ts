import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { RestockMovementType } from '../types/inventory'

export const GENERAL_STOCK_RESTOCK_ROLES: RoleName[] = ['SUPERADMIN']
export const RESTOCK_REASON_MIN_LENGTH = 10
export const RESTOCK_REASON_MAX_LENGTH = 500

export const restockSchema = z.object({
  movementType: z.enum(['ADJUSTMENT_ENTRY', 'ADJUSTMENT_EXIT']),
  quantity: z
    .string()
    .trim()
    .min(1, 'Escribe la cantidad.')
    .regex(
      /^[1-9]\d{0,8}$/,
      'La cantidad debe ser un número entero mayor que 0, sin puntos ni comas.',
    ),
  reason: z
    .string()
    .trim()
    .min(
      RESTOCK_REASON_MIN_LENGTH,
      `Explica el ajuste con al menos ${RESTOCK_REASON_MIN_LENGTH} caracteres.`,
    )
    .max(RESTOCK_REASON_MAX_LENGTH, 'La razón no puede superar 500 caracteres.'),
})

export type RestockValues = z.infer<typeof restockSchema>

export function projectedGeneralStock(
  current: number,
  movementType: RestockMovementType,
  quantityText: string,
): number | null {
  const quantity = /^[1-9]\d{0,8}$/.test(quantityText.trim()) ? Number(quantityText) : null
  if (quantity === null) return null
  return movementType === 'ADJUSTMENT_ENTRY' ? current + quantity : current - quantity
}

export function resolveRestockError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'INSUFFICIENT_GENERAL_STOCK': {
      const available = (error.details as { available?: number } | undefined)?.available
      return available !== undefined
        ? `El stock general solo tiene ${available} unidades de este producto: no puede quedar negativo.`
        : 'El stock general no tiene unidades suficientes para retirar esa cantidad.'
    }
    case 'PRODUCT_INACTIVE':
      return 'El producto está inactivo: su stock general no se puede ajustar.'
    case 'PRODUCT_NOT_FOUND':
      return 'El producto ya no existe. Elige otro producto.'
    case 'INVALID_QUANTITY':
      return 'La cantidad debe ser un número entero mayor que 0.'
  }
  if (error.status === 403) return 'Solo el superadmin puede ajustar el stock general.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
