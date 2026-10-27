import type {
  ClosureCount,
  ClosuresListParams,
  ClosuresListResponse,
  InventoryClosure,
} from '../types/inventoryClosure'

import { http } from './http'

const CLOSURES_PATH = '/inventory-closures'

function buildClosuresQuery(params: ClosuresListParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const inventoryClosuresService = {
  start: (branchId: string, token: string | null) =>
    http.post<InventoryClosure>(`/branches/${branchId}/inventory-closures`, undefined, { token }),

  get: (closureId: string, token: string | null) =>
    http.get<InventoryClosure>(`${CLOSURES_PATH}/${closureId}`, { token }),

  list: (params: ClosuresListParams, token: string | null) =>
    http.get<ClosuresListResponse>(`${CLOSURES_PATH}${buildClosuresQuery(params)}`, { token }),

  saveCounts: (closureId: string, items: ClosureCount[], token: string | null) =>
    http.put<InventoryClosure>(`${CLOSURES_PATH}/${closureId}/counts`, { items }, { token }),
}
