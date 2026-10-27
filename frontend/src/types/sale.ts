import type { PaginationMeta } from './user'

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
