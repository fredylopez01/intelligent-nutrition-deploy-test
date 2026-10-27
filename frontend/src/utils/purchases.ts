import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { PurchaseStatus, PurchaseSupplier } from '../types/purchase'

import { isValidPrice } from './products'

export const PURCHASE_MANAGE_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER']
export const PURCHASE_TEXT_MAX_LENGTH = 500

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

const WHOLE_PATTERN = /^[1-9]\d{0,8}$/

export const purchaseSchema = z.object({
  supplierId: z.string().min(1, 'Elige el proveedor.'),
  observation: z
    .string()
    .trim()
    .max(PURCHASE_TEXT_MAX_LENGTH, 'La observación no puede superar 500 caracteres.'),
  items: z
    .array(
      z.object({
        productId: z.string(),
        productName: z.string(),
        referenceCode: z.string(),
        unit: z.string(),
        requestedQuantity: z.string().trim().regex(WHOLE_PATTERN, 'Cantidad entera mayor que 0.'),
        unitPrice: z
          .string()
          .trim()
          .refine(isValidPrice, 'Costo con máximo 2 decimales, sin puntos de miles.'),
      }),
    )
    .min(1, 'Agrega al menos un producto a la orden.'),
})

export type PurchaseFormValues = z.infer<typeof purchaseSchema>

export function resolvePurchaseError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'SUPPLIER_INACTIVE':
      return 'El proveedor está inactivo. Elige otro proveedor.'
    case 'SUPPLIER_NOT_FOUND':
      return 'El proveedor ya no existe. Elige otro proveedor.'
    case 'PRODUCT_INACTIVE':
      return 'Uno de los productos está inactivo. Quítalo de la orden.'
    case 'PRODUCT_NOT_FOUND':
      return 'Uno de los productos ya no existe. Quítalo de la orden.'
    case 'DUPLICATED_PRODUCT':
      return 'Un producto está repetido en la orden.'
    case 'PURCHASE_NOT_FOUND':
      return 'La compra ya no existe. Recarga el listado.'
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 400) return 'Revisa los datos: hay un valor que el servidor no aceptó.'
  return fallback
}
