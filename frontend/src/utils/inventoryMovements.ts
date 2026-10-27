import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { InventoryLot } from '../types/inventory'
import type { InventoryMovement, MovementType } from '../types/inventoryMovement'

import { expirationState, formatExpirationDate, formatQuantity } from './inventory'

export const MOVEMENT_REGISTER_ROLES: RoleName[] = [
  'SUPERADMIN',
  'BRANCH_LEADER',
  'BRANCH_ASSISTANT',
]
export const MOVEMENT_TRANSFER_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER']

export const MOVEMENT_TEXT_MAX_LENGTH = 500

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

export function lotLabel(lot: { expirationDate: string; quantity: number }, unit: string): string {
  const { state } = expirationState(lot.expirationDate)
  const base = `Vence ${formatExpirationDate(lot.expirationDate)} · ${formatQuantity(lot.quantity, unit)}`
  return state === 'expired' ? `${base} · vencido` : base
}

export function lotDate(lot: InventoryLot): string {
  return lot.expirationDate.slice(0, 10)
}

export function isCurrentLot(lot: { expirationDate: string }): boolean {
  return expirationState(lot.expirationDate).state !== 'expired'
}

export function fefoLot<T extends { expirationDate: string; quantity: number }>(
  lots: T[],
): T | undefined {
  return [...lots]
    .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate))
    .find((lot) => lot.quantity > 0 && isCurrentLot(lot))
}

const QUANTITY_PATTERN = /^[1-9]\d{0,8}$/

const quantitySchema = z
  .string()
  .trim()
  .min(1, 'Escribe la cantidad.')
  .regex(
    QUANTITY_PATTERN,
    'La cantidad debe ser un número entero mayor que 0, sin puntos ni comas.',
  )

const lotSchema = z.string().min(1, 'Elige el lote.')

export const movementSchema = z
  .object({
    movementType: z.enum(['ENTRY', 'EXIT']),
    quantity: quantitySchema,
    expirationDate: lotSchema,
    observation: z
      .string()
      .trim()
      .max(MOVEMENT_TEXT_MAX_LENGTH, 'La observación no puede superar 500 caracteres.'),
  })
  .superRefine((values, context) => {
    if (values.movementType === 'EXIT' && values.observation.length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['observation'],
        message: 'Escribe el motivo de la salida, por ejemplo "Producto dañado".',
      })
    }
  })

export type MovementValues = z.infer<typeof movementSchema>

export const transferSchema = z.object({
  branchId: z.string().min(1, 'Elige la sede destino.'),
  quantity: quantitySchema,
  expirationDate: lotSchema,
  observation: z
    .string()
    .trim()
    .max(MOVEMENT_TEXT_MAX_LENGTH, 'La observación no puede superar 500 caracteres.'),
})

export type TransferValues = z.infer<typeof transferSchema>

export type MovementErrorField = 'quantity' | 'expirationDate' | 'branchId'

export function movementFieldError(
  error: unknown,
  unit = 'und',
): { field: MovementErrorField; message: string } | null {
  if (!(error instanceof ApiError)) return null
  const details = error.details as { available?: number } | undefined
  switch (error.code) {
    case 'INSUFFICIENT_STOCK':
      return {
        field: 'quantity',
        message:
          details?.available !== undefined
            ? `El lote solo tiene ${formatQuantity(details.available, unit)} en la sede.`
            : 'La sede no tiene unidades suficientes de este lote.',
      }
    case 'INSUFFICIENT_GENERAL_STOCK':
      return {
        field: 'quantity',
        message:
          details?.available !== undefined
            ? `El stock general solo tiene ${formatQuantity(details.available, unit)} de este lote.`
            : 'El stock general no tiene unidades suficientes de este lote.',
      }
    case 'LOT_EXPIRED':
      return {
        field: 'expirationDate',
        message: 'Ese lote está vencido: solo puede salir de la sede como salida o ajuste.',
      }
    case 'LOT_NOT_FOUND':
      return {
        field: 'expirationDate',
        message: 'La sede ya no tiene ese lote. Recarga los lotes y elige otro.',
      }
    case 'PRODUCT_NOT_ASSIGNED_IN_DESTINATION':
      return {
        field: 'branchId',
        message:
          'El producto no está asignado en la sede destino. Pide que lo asignen desde Inventario antes de trasladarlo.',
      }
    case 'SAME_BRANCH_TRANSFER':
      return { field: 'branchId', message: 'La sede destino debe ser distinta a la de origen.' }
  }
  return null
}

export function resolveMovementError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'INVENTORY_CLOSED':
      return 'El inventario de la sede ya se cerró hoy: no se pueden registrar más movimientos hasta mañana. Si hay una diferencia, el superadmin puede registrar un ajuste.'
    case 'BRANCH_INACTIVE':
      return 'La sede está inactiva: su inventario no se puede modificar.'
    case 'BRANCH_NOT_FOUND':
      return 'La sede ya no existe. Recarga la página.'
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso a esta sede.'
    case 'BRANCH_REQUIRED':
      return 'Elige una sede para ver sus movimientos.'
    case 'PRODUCT_NOT_ASSIGNED':
      return 'El producto ya no está asignado a la sede. Recarga y elige otro producto.'
    case 'PRODUCT_INACTIVE':
      return 'El producto está inactivo y no admite movimientos.'
    case 'PRODUCT_NOT_FOUND':
      return 'El producto ya no existe. Recarga y elige otro producto.'
  }
  const fieldError = movementFieldError(error)
  if (fieldError) return fieldError.message
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
