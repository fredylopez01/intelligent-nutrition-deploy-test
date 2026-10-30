import type { PaginationMeta } from './user'

export type MovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT_ENTRY' | 'ADJUSTMENT_EXIT' | 'TRANSFER'

export interface MovementBranch {
  id: string
  name: string
}

export interface InventoryMovement {
  id: string
  movementType: MovementType
  quantity: number
  expirationDate: string | null
  product: { id: string; name: string; referenceCode: string; unit: string }
  branch: MovementBranch | null
  originBranch: MovementBranch | null
  user: { id: string; fullName: string }
  observation: string | null
  saleId: string | null
  purchaseId: string | null
  movementAt: string
}

export interface RegisteredMovement extends InventoryMovement {
  resultingQuantity: number
  originResultingQuantity?: number
}

export interface MovementsListParams {
  page?: number
  limit?: number
  branchId?: string
  productId?: string
  movementType?: MovementType
  from?: string
  to?: string
  userId?: string
}

export interface MovementsListResponse {
  data: InventoryMovement[]
  meta: PaginationMeta
}

export interface CreateMovementPayload {
  branchId: string
  productId: string
  movementType: 'ENTRY' | 'EXIT'
  quantity: number
  expirationDate?: string
  observation?: string
}

export interface CreateTransferPayload {
  originBranchId: string
  branchId: string
  productId: string
  quantity: number
  expirationDate?: string
  observation?: string
}

export interface CreateAdjustmentPayload {
  branchId: string
  productId: string
  movementType: 'ADJUSTMENT_ENTRY' | 'ADJUSTMENT_EXIT'
  quantity: number
  expirationDate?: string
  reason: string
}
