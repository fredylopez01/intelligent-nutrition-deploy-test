import type { SellableProductsParams, SellableProductsResponse } from '../types/sale'

import { http } from './http'

function buildQuery(params: object): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const salesService = {
  sellableProducts: (branchId: string, params: SellableProductsParams, token: string | null) =>
    http.get<SellableProductsResponse>(
      `/branches/${branchId}/sellable-products${buildQuery(params)}`,
      { token },
    ),
}
