import type { PaginationMeta } from './user'

export interface Category {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CategoriesListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface CategoriesListResponse {
  data: Category[]
  meta: PaginationMeta
}
