import type { DocumentTypeRef } from './supplier'
import type { PaginationMeta } from './user'

export type CustomerKind = 'natural' | 'empresa'

export interface CustomerPerson {
  id: string
  documentTypeId?: string
  documentNumber: string
  firstName: string | null
  lastName: string | null
  businessName: string | null
  email: string
  phone: string
  address: string
  documentType: DocumentTypeRef
}

export interface Customer {
  id: string
  fullName: string
  active: boolean
  createdAt?: string
  updatedAt?: string
  person: CustomerPerson
}

export interface CustomersListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface CustomersListResponse {
  data: Customer[]
  meta: PaginationMeta
}

export type CreateCustomerPayload = { personId: string } | CreateCustomerWithPersonPayload

export interface CreateCustomerWithPersonPayload {
  person: {
    documentTypeId: string
    documentNumber: string
    firstName?: string
    lastName?: string
    businessName?: string
    email: string
    phone: string
    address: string
  }
}

export interface UpdateCustomerPayload {
  person: Partial<{
    firstName: string
    lastName: string
    businessName: string
    email: string
    phone: string
    address: string
  }>
}

export interface UpdateCustomerStatusPayload {
  active: boolean
}
