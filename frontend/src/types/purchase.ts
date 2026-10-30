import type { PaginationMeta } from './user'

export type PurchaseStatus = 'PENDING_RECEIPT' | 'PARTIALLY_RECEIVED' | 'FULLY_RECEIVED'

export interface PurchaseSupplier {
  id: string
  commercialName: string | null
  businessName: string | null
}

export interface PurchaseSummary {
  id: string
  purchaseNumber: string
  status: PurchaseStatus
  supplier: PurchaseSupplier
  total: string
  purchaseAt: string
  itemsCount: number
}

export interface PurchaseItem {
  id: string
  productId: string
  productName: string
  referenceCode: string
  requestedQuantity: number
  receivedQuantity: number
  unitPrice: string
  subtotal: string
  received: boolean
  observation: string | null
}

export interface Purchase extends Omit<PurchaseSummary, 'itemsCount'> {
  user: { id: string; fullName: string }
  subtotal: string
  observation: string | null
  items: PurchaseItem[]
}

export interface PurchasesListParams {
  page?: number
  limit?: number
  supplierId?: string
  status?: PurchaseStatus
  from?: string
  to?: string
  search?: string
}

export interface PurchasesListResponse {
  data: PurchaseSummary[]
  meta: PaginationMeta
}

export interface CreatePurchasePayload {
  supplierId: string
  observation?: string
  items: { productId: string; requestedQuantity: number; unitPrice: string; observation?: string }[]
}

export interface ReceiptItemPayload {
  purchaseDetailId: string
  receivedQuantity: number
  expirationDate: string
  observation?: string
}
