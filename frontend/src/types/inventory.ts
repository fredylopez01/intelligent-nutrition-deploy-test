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
