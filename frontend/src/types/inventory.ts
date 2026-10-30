import type { PaginationMeta } from './user'

export interface InventoryProduct {
  id: string
  name: string
  referenceCode: string
  category: { id: string; name: string }
  unitOfMeasure: { abbreviation: string }
  price: string
  active: boolean
}

export interface BranchInventoryItem {
  product: InventoryProduct
  totalQuantity: number
  minimumStock?: number
  lowStock?: boolean
}

export interface InventoryLot {
  id: string
  quantity: number
  expirationDate: string
  updatedAt?: string
}

export interface BranchInventoryDetail extends BranchInventoryItem {
  branchId: string
  lots: InventoryLot[]
}

export interface BranchInventoryParams {
  page?: number
  limit?: number
  search?: string
  categoryId?: string
  lowStock?: boolean
}

export interface BranchInventoryResponse {
  data: BranchInventoryItem[]
  meta: PaginationMeta
}

export interface AssignProductPayload {
  productId: string
  quantity: number
  minimumStock?: number
  expirationDate: string
}

export interface AssignedLot {
  id: string
  branchId: string
  product: InventoryProduct
  quantity: number
  minimumStock: number
  lowStock: boolean
  expirationDate: string
  updatedAt: string
}

export interface MinimumStockResult {
  branchId: string
  productId: string
  minimumStock: number
  totalQuantity: number
  lowStock: boolean
  lotsUpdated: number
  lots: InventoryLot[]
  updatedAt: string
}

export interface InventoryProductRef {
  id: string
  name: string
  referenceCode: string
}

export interface AvailabilityBranch {
  branchId: string
  branchName: string
  quantity: number
}

export interface ProductAvailability {
  product: InventoryProductRef
  branches: AvailabilityBranch[]
}

export interface ConsolidatedBranch {
  branchId: string
  branchName: string
  quantity: number
  minimumStock: number
}

export interface ConsolidatedItem {
  product: InventoryProductRef
  branchesTotal: number
  total: number
  branches: ConsolidatedBranch[]
}

export interface ConsolidatedParams {
  page?: number
  limit?: number
  search?: string
  categoryId?: string
}

export interface ConsolidatedResponse {
  data: ConsolidatedItem[]
  meta: PaginationMeta
}

export interface GeneralStockLot {
  id: string
  expirationDate: string
  quantity: number
  expired: boolean
}

export interface GeneralStockDetail {
  product: {
    id: string
    name: string
    referenceCode: string
    active: boolean
    unitOfMeasure: { abbreviation: string }
  }
  totalQuantity: number
  lots: GeneralStockLot[]
}

export type RestockMovementType = 'ADJUSTMENT_ENTRY' | 'ADJUSTMENT_EXIT'

export interface RestockPayload {
  quantity: number
  movementType: RestockMovementType
  reason: string
}
