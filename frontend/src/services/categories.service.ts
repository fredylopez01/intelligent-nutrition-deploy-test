import type {
  CategoriesListParams,
  CategoriesListResponse,
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  UpdateCategoryStatusPayload,
} from '../types/category'

import { http } from './http'

function buildCategoriesQuery({ page, limit, search, active }: CategoriesListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const categoriesService = {
  list: (params: CategoriesListParams, token: string | null) =>
    http.get<CategoriesListResponse>(`/categories${buildCategoriesQuery(params)}`, { token }),

  create: (payload: CreateCategoryPayload, token: string | null) =>
    http.post<Category>('/categories', payload, { token }),

  update: (categoryId: string, payload: UpdateCategoryPayload, token: string | null) =>
    http.patch<Category>(`/categories/${categoryId}`, payload, { token }),

  updateStatus: (categoryId: string, payload: UpdateCategoryStatusPayload, token: string | null) =>
    http.patch<{ message: string }>(`/categories/${categoryId}/status`, payload, { token }),
}
