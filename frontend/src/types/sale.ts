import type { PaginationMeta } from './user'

export type SaleStatus = 'COMPLETED' | 'REVERSED'

export interface SellableProduct {
  productId: string
  name: string
  referenceCode: string
  primaryImageUrl: string | null
  price: string
  availableQuantity: number
  unit?: string
  category?: { id: string; name: string }
}

export interface SellableProductsParams {
  page?: number
  limit?: number
  search?: string
  categoryId?: string
}

export interface SellableProductsResponse {
  data: SellableProduct[]
  meta: PaginationMeta
}

export interface SaleSummary {
  id: string
  saleNumber: string
  status: SaleStatus
  branch: { id: string; name: string }
  user: { id: string; fullName: string }
  customer: { id: string; fullName: string } | null
  saleAt: string
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  reversalReason: string | null
  reversedAt: string | null
  itemsCount: number
}

export interface SaleItem {
  productId: string
  productName: string
  referenceCode: string
  quantity: number
  unitPrice: string
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
}

export interface SalePayment {
  paymentMethod: { id: string; code: string; name: string }
  amount: string
  reference: string | null
  paidAt: string
}

export interface Sale extends Omit<SaleSummary, 'itemsCount'> {
  items: SaleItem[]
  payments: SalePayment[]
}

export interface SalesListParams {
  page?: number
  limit?: number
  branchId?: string
  status?: SaleStatus
  from?: string
  to?: string
  search?: string
}

export interface SalesListResponse {
  data: SaleSummary[]
  meta: PaginationMeta
}

export interface CreateSalePayload {
  branchId: string
  customerId?: string | null
  items: { productId: string; quantity: number }[]
  payments: { paymentMethodId: string; amount: string; reference?: string | null }[]
}
