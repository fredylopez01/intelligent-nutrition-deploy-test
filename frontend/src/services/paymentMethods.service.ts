import type { PaymentMethodsListParams, PaymentMethodsListResponse } from '../types/paymentMethod'

import { http } from './http'

const PAYMENT_METHODS_PATH = '/payment-methods'

function buildPaymentMethodsQuery({
  page,
  limit,
  search,
  active,
}: PaymentMethodsListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const paymentMethodsService = {
  list: (params: PaymentMethodsListParams, token: string | null) =>
    http.get<PaymentMethodsListResponse>(
      `${PAYMENT_METHODS_PATH}${buildPaymentMethodsQuery(params)}`,
      { token },
    ),
}
