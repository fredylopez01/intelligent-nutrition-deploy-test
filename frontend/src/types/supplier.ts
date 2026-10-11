import type { PaginationMeta } from './user'

export interface DocumentTypeRef {
  code: string
  name: string
}

export interface DocumentType {
  id: string
  code: string
  name: string
  active: boolean
}

export interface SupplierPerson {
  businessName: string | null
  documentNumber: string | null
  documentType: DocumentTypeRef | null
  email: string | null
  phone: string | null
  address: string | null
  active: boolean
}

export interface Supplier {
  id: string
  person: SupplierPerson
  commercialName: string | null
}

export interface CreateSupplierPersonPayload {
  documentTypeId: string
  documentNumber: string
  businessName: string
  email: string
  phone: string
  address: string
}

export type CreateSupplierPayload = (
  { person: CreateSupplierPersonPayload } | { personId: string }
) & {
  commercialName: string
}

export interface SuppliersListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface SuppliersListResponse {
  data: Supplier[]
  meta: PaginationMeta
}

export interface UpdateSupplierPayload {
  commercialName?: string
  phone?: string
  address?: string
}
