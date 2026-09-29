import type { Branch, CreateBranchPayload } from '../types/branch'

import { http } from './http'

export const branchesService = {
  create: (payload: CreateBranchPayload, token: string | null): Promise<Branch> =>
    http.post<Branch>('/branches', payload, { token }),
}
