import type {
  CreatePurchasePayload,
  Purchase,
  PurchasesListParams,
  PurchasesListResponse,
  ReceiptItemPayload,
} from '../types/purchase'

import { http } from './http'

const PURCHASES_PATH = '/purchases'

function buildPurchasesQuery(params: PurchasesListParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const purchasesService = {
  list: (params: PurchasesListParams, token: string | null) =>
    http.get<PurchasesListResponse>(`${PURCHASES_PATH}${buildPurchasesQuery(params)}`, { token }),

  get: (purchaseId: string, token: string | null) =>
    http.get<Purchase>(`${PURCHASES_PATH}/${purchaseId}`, { token }),

  create: (payload: CreatePurchasePayload, token: string | null) =>
    http.post<Purchase>(PURCHASES_PATH, payload, { token }),

  receive: (purchaseId: string, items: ReceiptItemPayload[], token: string | null) =>
    http.post<Purchase>(`${PURCHASES_PATH}/${purchaseId}/receipts`, { items }, { token }),
}
