import type { PaginationMeta } from './user'

export interface UnitOfMeasure {
  id: string
  name: string
  abbreviation: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface UnitsListParams {
  page?: number
  limit?: number
  search?: string
  active?: boolean
}

export interface UnitsListResponse {
  data: UnitOfMeasure[]
  meta: PaginationMeta
}

export interface CreateUnitPayload {
  name: string
  abbreviation: string
}

export interface UpdateUnitPayload {
  name?: string
  abbreviation?: string
}
