import type { PaginationMeta } from './user'

export interface ProductCategoryRef {
  id: string
  name: string
}

export interface ProductUnitRef {
  id: string
  name: string
  abbreviation: string
}

export interface ProductImage {
  id: string
  url: string
  fileName: string
  mimeType: string
  sizeBytes: number
  isPrimary: boolean
  sortOrder: number
  createdAt?: string
}

export interface Product {
  id: string
  name: string
  referenceCode: string
  description: string | null
  category: ProductCategoryRef
  unitOfMeasure: ProductUnitRef
  price: string
  active: boolean
  primaryImageUrl?: string | null
  images?: ProductImage[]
  createdAt?: string
  updatedAt?: string
}

export interface ProductsListParams {
  page?: number
  limit?: number
  search?: string
  categoryId?: string
  unitOfMeasureId?: string
  active?: boolean
}

export interface ProductsListResponse {
  data: Product[]
  meta: PaginationMeta
}

export interface CreateProductPayload {
  name: string
  referenceCode: string
  description?: string
  categoryId: string
  unitOfMeasureId: string
  price: string
}

export interface UpdateProductPayload {
  name?: string
  description?: string
  categoryId?: string
  unitOfMeasureId?: string
  price?: string
}

export interface ImageUploadRequest {
  fileName: string
  mimeType: string
  sizeBytes: number
}

export interface ImageUploadTicket {
  uploadUrl: string
  storageKey: string
  publicUrl: string
  expiresIn: number
}

export interface ConfirmImagePayload extends ImageUploadRequest {
  storageKey: string
  url: string
  isPrimary?: boolean
  sortOrder?: number
}

export interface UpdateImagePayload {
  isPrimary?: boolean
  sortOrder?: number
}
