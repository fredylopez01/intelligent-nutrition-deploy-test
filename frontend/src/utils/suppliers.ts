import { ApiError } from '../services/http'
import type { Supplier } from '../types/supplier'

export type SupplierKind = 'empresa' | 'natural'

export function getSupplierKind(supplier: Supplier): SupplierKind {
  return supplier.person.businessName ? 'empresa' : 'natural'
}

export function getSupplierName(supplier: Supplier): string {
  const { businessName, firstName, lastName } = supplier.person
  if (businessName) return businessName
  return [firstName, lastName].filter(Boolean).join(' ') || 'Sin nombre'
}

export function resolveSupplierLoadError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  if (error.status === 403) return 'No tienes permiso para ver proveedores.'
  return fallback
}

export function getSupplierDocument(supplier: Supplier): string {
  const { documentType, documentNumber } = supplier.person
  if (!documentNumber) return '—'
  return documentType ? `${documentType.code} ${documentNumber}` : documentNumber
}

export const SUPPLIER_KIND_LABELS: Record<SupplierKind, string> = {
  empresa: 'Empresa',
  natural: 'Persona natural',
}
