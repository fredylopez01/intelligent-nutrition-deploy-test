import type { PaginationMeta } from './user'

export interface PaymentMethod {
  id: string
  code: string
  name: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface PaymentMethodsListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface PaymentMethodsListResponse {
  data: PaymentMethod[]
  meta: PaginationMeta
}

export interface CreatePaymentMethodPayload {
  code: string
  name: string
}

export interface UpdatePaymentMethodPayload {
  name: string
}
