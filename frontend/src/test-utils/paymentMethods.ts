import type { PaymentMethod } from '../types/paymentMethod'

export const CASH: PaymentMethod = { id: 'pm-cash', code: 'CASH', name: 'Efectivo', active: true }
export const NEQUI: PaymentMethod = { id: 'pm-nequi', code: 'NEQUI', name: 'Nequi', active: true }
export const OTHER: PaymentMethod = { id: 'pm-other', code: 'OTHER', name: 'Otro', active: false }

export function paymentMethodsPage(
  data: PaymentMethod[],
  meta: Partial<{ page: number; total: number; totalPages: number }> = {},
) {
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      limit: 10,
      total: meta.total ?? data.length,
      totalPages: meta.totalPages ?? (data.length ? 1 : 0),
    },
  }
}
