import { ApiError } from '../services/http'
import type { Customer, CustomerKind } from '../types/customer'

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
  natural: 'Persona natural',
  empresa: 'Empresa',
}

export const DOCUMENT_CODES_BY_KIND: Record<CustomerKind, string[]> = {
  natural: ['CC', 'CE', 'PAS'],
  empresa: ['NIT'],
}

export const CUSTOMER_STATUS_ROLES = ['SUPERADMIN', 'BRANCH_LEADER']

export function getCustomerKind(customer: Customer): CustomerKind {
  return customer.person.businessName ? 'empresa' : 'natural'
}

export function getCustomerDocument(customer: Customer): string {
  return `${customer.person.documentType.code} ${customer.person.documentNumber}`
}

export function canManageCustomerStatus(roleName: string | undefined): boolean {
  return roleName !== undefined && CUSTOMER_STATUS_ROLES.includes(roleName)
}

export function getStatusChangedMessage(fullName: string, active: boolean): string {
  return active
    ? `El cliente ${fullName} quedó activo.`
    : `El cliente ${fullName} quedó inactivo. Ya no se podrá usar en ventas nuevas.`
}

export function resolveCustomerError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'ALREADY_CUSTOMER':
      return 'Este cliente ya está registrado. Búscalo por su documento en el listado.'
    case 'EMAIL_ALREADY_IN_USE':
      return 'Ese correo ya pertenece a otra persona registrada. Usa un correo diferente.'
    case 'DOCUMENT_ALREADY_IN_USE':
      return 'Ese documento ya pertenece a otra persona registrada.'
    case 'ALREADY_IN_STATE':
      return 'El cliente ya tenía ese estado. Recarga el listado para ver su estado actual.'
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404)
    return 'El cliente o la persona ya no existe o está inactiva. Recarga e intenta de nuevo.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}
