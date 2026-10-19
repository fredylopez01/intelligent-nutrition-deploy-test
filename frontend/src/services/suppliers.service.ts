import type {
  CreateSupplierPayload,
  Supplier,
  SuppliersListParams,
  SuppliersListResponse,
  UpdateSupplierPayload,
} from '../types/supplier'

import { ApiError, http } from './http'
import { MOCK_SUPPLIERS } from './mocks/suppliers.mock'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
const MOCK_DELAY_MS = 500

function delay(ms = MOCK_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildSuppliersQuery({ page, limit, search, active }: SuppliersListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search?.trim()) params.set('search', search.trim())
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function listMock(params: SuppliersListParams): Promise<SuppliersListResponse> {
  await delay()
  const page = params.page ?? 1
  const limit = params.limit ?? 10
  const term = params.search?.trim().toLowerCase() ?? ''

  let filtered = [...MOCK_SUPPLIERS]
  if (params.active !== undefined) {
    filtered = filtered.filter((s) => s.person.active === params.active)
  }
  if (term) {
    filtered = filtered.filter(
      (s) =>
        s.person.businessName?.toLowerCase().includes(term) ||
        s.commercialName?.toLowerCase().includes(term) ||
        s.person.documentNumber?.includes(term) ||
        s.person.email?.toLowerCase().includes(term),
    )
  }

  const start = (page - 1) * limit
  const total = filtered.length
  return {
    data: filtered.slice(start, start + limit),
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }
}

export const suppliersService = {
  list: (params: SuppliersListParams, token: string | null): Promise<SuppliersListResponse> => {
    if (USE_MOCKS) return listMock(params)
    return http.get<SuppliersListResponse>(`/suppliers${buildSuppliersQuery(params)}`, { token })
  },

  getById: async (id: string, token: string | null): Promise<Supplier> => {
    if (USE_MOCKS) {
      await delay()
      const target = MOCK_SUPPLIERS.find((s) => s.id === id)
      if (!target) throw new ApiError('Supplier not found', 404)
      return target
    }
    return http.get<Supplier>(`/suppliers/${id}`, { token })
  },

  create: async (payload: CreateSupplierPayload, token: string | null): Promise<Supplier> => {
    if (USE_MOCKS) {
      await delay()
      return {
        id: `mock-${Date.now()}`,
        person: {
          businessName: 'person' in payload ? (payload.person.businessName ?? null) : null,
          documentNumber: 'person' in payload ? payload.person.documentNumber : null,
          documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
          email: 'person' in payload ? payload.person.email : null,
          phone: 'person' in payload ? payload.person.phone : null,
          address: 'person' in payload ? payload.person.address : null,
          active: true,
        },
        commercialName: payload.commercialName,
      }
    }
    return http.post<Supplier>('/suppliers', payload, { token })
  },

  update: async (
    id: string,
    payload: UpdateSupplierPayload,
    token: string | null,
  ): Promise<Supplier> => {
    if (USE_MOCKS) {
      await delay()
      const target = MOCK_SUPPLIERS.find((s) => s.id === id)
      if (!target) throw new Error('Proveedor no encontrado')
      if (payload.commercialName !== undefined) target.commercialName = payload.commercialName
      Object.assign(target.person, payload.person ?? {})
      return target
    }
    return http.patch<Supplier>(`/suppliers/${id}`, payload, { token })
  },
}
