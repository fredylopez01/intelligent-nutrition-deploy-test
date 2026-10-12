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
