import { ApiError } from '../services/http'
import type { PurchaseStatus, PurchaseSupplier } from '../types/purchase'

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  PENDING_RECEIPT: 'Pendiente',
  PARTIALLY_RECEIVED: 'Recibida en parte',
  FULLY_RECEIVED: 'Recibida',
}

export const PURCHASE_STATUS_TONES: Record<PurchaseStatus, string> = {
  PENDING_RECEIPT: 'pendiente',
  PARTIALLY_RECEIVED: 'pendiente',
  FULLY_RECEIVED: 'activo',
}

export function supplierName(supplier: PurchaseSupplier): string {
  return supplier.commercialName ?? supplier.businessName ?? 'Proveedor sin nombre'
}

export function resolvePurchaseError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'PURCHASE_NOT_FOUND':
      return 'La compra ya no existe. Recarga el listado.'
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
