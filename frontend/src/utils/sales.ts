import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { SaleStatus } from '../types/sale'

export const SALE_REGISTER_ROLES: RoleName[] = ['BRANCH_LEADER', 'BRANCH_ASSISTANT']

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  COMPLETED: 'Completada',
  REVERSED: 'Reversada',
}

export const SALE_STATUS_TONES: Record<SaleStatus, string> = {
  COMPLETED: 'activo',
  REVERSED: 'inactivo',
}

export function resolveSaleError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'SALE_NOT_FOUND':
      return 'La venta ya no existe. Recarga el listado.'
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
