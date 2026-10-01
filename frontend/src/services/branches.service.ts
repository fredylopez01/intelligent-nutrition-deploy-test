import type {
  Branch,
  BranchesListParams,
  BranchesListResponse,
  CreateBranchPayload,
  UpdateBranchPayload,
} from '../types/branch'

import { http } from './http'

function buildBranchesQuery({ page, limit, search, active }: BranchesListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const branchesService = {
  list: (params: BranchesListParams, token: string | null): Promise<BranchesListResponse> =>
    http.get<BranchesListResponse>(`/branches${buildBranchesQuery(params)}`, { token }),

  create: (payload: CreateBranchPayload, token: string | null): Promise<Branch> =>
    http.post<Branch>('/branches', payload, { token }),

  update: (id: string, payload: UpdateBranchPayload, token: string | null): Promise<Branch> =>
    http.patch<Branch>(`/branches/${id}`, payload, { token }),
}
