import type { GeneralStockDetail } from '../types/inventory'

import { http } from './http'

export const generalStockService = {
  getByProduct: (productId: string, token: string | null) =>
    http.get<GeneralStockDetail>(`/general-stock/${productId}`, { token }),
}
