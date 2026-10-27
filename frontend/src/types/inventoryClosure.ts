import type { PaginationMeta } from './user'

export type ClosureStatus = 'PENDING' | 'CONFIRMED' | 'NOT_CONFIRMED'

export interface ClosureItem {
  productId: string
  productName: string
  referenceCode: string
  unit: string
  expirationDate: string | null
  physicalQuantity: number | null
  observation: string | null
  systemQuantity?: number
  difference?: number | null
}

export interface InventoryClosure {
  id: string
  branchId: string
  branchName: string
  closureDate: string
  status: ClosureStatus
  confirmed: boolean
  locked: boolean
  closedAt: string | null
  userName: string | null
  countedItems: number
  totalItems: number
  totalDifferences?: number
  items: ClosureItem[]
}

export type ClosureSummary = Omit<InventoryClosure, 'items' | 'totalDifferences'> & {
  totalDifferences?: number | null
}

export interface ClosuresListParams {
  page?: number
  limit?: number
  branchId?: string
  status?: ClosureStatus
  from?: string
  to?: string
}

export interface ClosuresListResponse {
  data: ClosureSummary[]
  meta: PaginationMeta
}

export interface ClosureCount {
  productId: string
  expirationDate: string
  physicalQuantity: number
  observation?: string
}
