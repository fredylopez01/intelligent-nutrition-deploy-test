import type { PaginationMeta } from './user'

export interface PersonRelationships {
  hasUserAccount: boolean
  isCustomer: boolean
  isSupplier: boolean
}

export interface PersonSearchResult {
  id: string
  documentTypeId: string
  documentNumber: string
  firstName: string | null
  lastName: string | null
  businessName: string | null
  email: string
  phone: string
  address: string
  relationships: PersonRelationships
}

export interface PersonsSearchResponse {
  data: PersonSearchResult[]
  meta: PaginationMeta
}

export type PersonRole = 'customer' | 'user' | 'supplier'
