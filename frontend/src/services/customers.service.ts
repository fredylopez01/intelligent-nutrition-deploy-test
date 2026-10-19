import type {
  CreateCustomerPayload,
  Customer,
  CustomersListParams,
  CustomersListResponse,
  UpdateCustomerPayload,
  UpdateCustomerStatusPayload,
} from '../types/customer'

import { http } from './http'

function buildCustomersQuery({ page, limit, search, active }: CustomersListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const customersService = {
  list: (params: CustomersListParams, token: string | null) =>
    http.get<CustomersListResponse>(`/customers${buildCustomersQuery(params)}`, { token }),

  getById: (customerId: string, token: string | null) =>
    http.get<Customer>(`/customers/${customerId}`, { token }),

  create: (payload: CreateCustomerPayload, token: string | null) =>
    http.post<Customer>('/customers', payload, { token }),

  update: (customerId: string, payload: UpdateCustomerPayload, token: string | null) =>
    http.patch<Customer>(`/customers/${customerId}`, payload, { token }),

  updateStatus: (customerId: string, payload: UpdateCustomerStatusPayload, token: string | null) =>
    http.patch<{ message: string }>(`/customers/${customerId}/status`, payload, { token }),
}
