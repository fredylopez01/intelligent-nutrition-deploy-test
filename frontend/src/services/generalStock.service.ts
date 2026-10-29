import type { GeneralStockDetail, RestockPayload } from '../types/inventory'

import { http } from './http'

export const generalStockService = {
  getByProduct: (productId: string, token: string | null) =>
    http.get<GeneralStockDetail>(`/general-stock/${productId}`, { token }),

  restock: (productId: string, payload: RestockPayload, token: string | null) =>
    http.post<GeneralStockDetail>(`/general-stock/${productId}/restock`, payload, { token }),
}
