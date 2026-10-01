export interface Branch {
  id: string
  name: string
  address: string
  phone: string
  active: boolean
}

export interface CreateBranchPayload {
  name: string
  address: string
  phone: string
}

export interface UpdateBranchPayload {
  name?: string
  address?: string
  phone?: string
}

export interface BranchesPaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface BranchesListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface BranchesListResponse {
  data: Branch[]
  meta: BranchesPaginationMeta
  message?: string
}
