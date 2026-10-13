import type {
  CreateProductPayload,
  Product,
  ProductsListParams,
  ProductsListResponse,
} from '../types/product'

import { http } from './http'

function buildProductsQuery({
  page,
  limit,
  search,
  categoryId,
  unitOfMeasureId,
  active,
}: ProductsListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (categoryId) params.set('categoryId', categoryId)
  if (unitOfMeasureId) params.set('unitOfMeasureId', unitOfMeasureId)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

function unwrapProduct(body: Product | { data: Product }): Product {
  return 'data' in body ? body.data : body
}

export const productsService = {
  list: (params: ProductsListParams, token: string | null) =>
    http.get<ProductsListResponse>(`/products${buildProductsQuery(params)}`, { token }),

  getById: async (productId: string, token: string | null): Promise<Product> =>
    unwrapProduct(await http.get<Product | { data: Product }>(`/products/${productId}`, { token })),

  create: (payload: CreateProductPayload, token: string | null) =>
    http.post<Product>('/products', payload, { token }),
}
