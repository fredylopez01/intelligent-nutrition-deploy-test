import type {
  AssignedLot,
  AssignProductPayload,
  BranchInventoryDetail,
  BranchInventoryParams,
  BranchInventoryResponse,
  MinimumStockResult,
} from '../types/inventory'

import { http } from './http'

function buildQuery(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

function unwrap<T>(body: T | { data: T }): T {
  return body !== null && typeof body === 'object' && 'data' in body ? body.data : body
}

const branchInventoryPath = (branchId: string) => `/branches/${branchId}/inventory`

export const inventoryService = {
  listByBranch: (branchId: string, params: BranchInventoryParams, token: string | null) =>
    http.get<BranchInventoryResponse>(
      `${branchInventoryPath(branchId)}${buildQuery({ ...params })}`,
      { token },
    ),

  getProductInBranch: async (
    branchId: string,
    productId: string,
    token: string | null,
  ): Promise<BranchInventoryDetail> =>
    unwrap(
      await http.get<BranchInventoryDetail | { data: BranchInventoryDetail }>(
        `${branchInventoryPath(branchId)}/${productId}`,
        { token },
      ),
    ),

  assign: async (
    branchId: string,
    payload: AssignProductPayload,
    token: string | null,
  ): Promise<AssignedLot> =>
    unwrap(
      await http.post<AssignedLot | { data: AssignedLot }>(branchInventoryPath(branchId), payload, {
        token,
      }),
    ),

  updateMinimumStock: async (
    branchId: string,
    productId: string,
    minimumStock: number,
    token: string | null,
  ): Promise<MinimumStockResult> =>
    unwrap(
      await http.patch<MinimumStockResult | { data: MinimumStockResult }>(
        `${branchInventoryPath(branchId)}/${productId}`,
        { minimumStock },
        { token },
      ),
    ),
}
