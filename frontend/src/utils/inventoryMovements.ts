import { ApiError } from '../services/http'
import type { InventoryMovement, MovementType } from '../types/inventoryMovement'

import { formatQuantity } from './inventory'

export const MOVEMENT_TYPE_OPTIONS: { value: MovementType; label: string }[] = [
  { value: 'ENTRY', label: 'Entradas' },
  { value: 'EXIT', label: 'Salidas' },
  { value: 'TRANSFER', label: 'Traslados' },
  { value: 'ADJUSTMENT_ENTRY', label: 'Ajustes de entrada' },
  { value: 'ADJUSTMENT_EXIT', label: 'Ajustes de salida' },
]

export type MovementKind =
  | 'entry'
  | 'exit'
  | 'sale'
  | 'sale-reversal'
  | 'purchase'
  | 'transfer'
  | 'assignment'
  | 'adjustment-entry'
  | 'adjustment-exit'

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  entry: 'Entrada',
  exit: 'Salida',
  sale: 'Venta',
  'sale-reversal': 'Reversión de venta',
  purchase: 'Recepción de compra',
  transfer: 'Traslado',
  assignment: 'Asignación',
  'adjustment-entry': 'Ajuste de entrada',
  'adjustment-exit': 'Ajuste de salida',
}

export function movementKind(movement: InventoryMovement): MovementKind {
  switch (movement.movementType) {
    case 'ENTRY':
      if (movement.saleId) return 'sale-reversal'
      if (movement.purchaseId) return 'purchase'
      return 'entry'
    case 'EXIT':
      return movement.saleId ? 'sale' : 'exit'
    case 'TRANSFER':
      return movement.originBranch ? 'transfer' : 'assignment'
    case 'ADJUSTMENT_ENTRY':
      return 'adjustment-entry'
    case 'ADJUSTMENT_EXIT':
      return 'adjustment-exit'
  }
}

export type MovementDirection = 'in' | 'out' | 'between'

export function movementDirection(
  movement: InventoryMovement,
  viewedBranchId?: string,
): MovementDirection {
  if (movement.movementType === 'TRANSFER') {
    if (!movement.originBranch) return 'in'
    if (viewedBranchId && movement.originBranch.id === viewedBranchId) return 'out'
    if (viewedBranchId && movement.branch?.id === viewedBranchId) return 'in'
    return 'between'
  }
  return movement.movementType === 'EXIT' || movement.movementType === 'ADJUSTMENT_EXIT'
    ? 'out'
    : 'in'
}

export function signedQuantity(movement: InventoryMovement, viewedBranchId?: string): string {
  const quantity = formatQuantity(movement.quantity, movement.product.unit)
  const direction = movementDirection(movement, viewedBranchId)
  if (direction === 'between') return quantity
  return `${direction === 'in' ? '+' : '−'}${quantity}`
}

export function movementPlace(movement: InventoryMovement): string {
  if (movement.movementType === 'TRANSFER') {
    return `${movement.originBranch?.name ?? 'Stock general'} → ${movement.branch?.name ?? 'Sede'}`
  }
  return movement.branch?.name ?? 'Stock general'
}

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Bogota',
})

export function formatMovementDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '—'
  const parts = dateTimeFormatter.formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  const period = part('dayPeriod').replace(/\s/g, ' ')
  return `${part('day')} ${part('month').replace('.', '')} ${part('year')}, ${part('hour')}:${part('minute')} ${period}`
}

export function resolveMovementError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'BRANCH_NOT_FOUND':
      return 'La sede ya no existe. Recarga la página.'
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso a esta sede.'
    case 'BRANCH_REQUIRED':
      return 'Elige una sede para ver sus movimientos.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
