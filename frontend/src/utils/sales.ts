import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'

export const SALE_REGISTER_ROLES: RoleName[] = ['BRANCH_LEADER', 'BRANCH_ASSISTANT']

export function resolveSaleError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'BRANCH_SCOPE_VIOLATION':
      return 'No tienes acceso a esta sede.'
    case 'BRANCH_NOT_FOUND':
      return 'La sede ya no existe. Recarga la página.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
