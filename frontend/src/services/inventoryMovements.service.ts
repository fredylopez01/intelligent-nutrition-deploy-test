import type {
  CreateAdjustmentPayload,
  CreateMovementPayload,
  CreateTransferPayload,
  MovementsListParams,
  MovementsListResponse,
  RegisteredMovement,
} from '../types/inventoryMovement'

import { http } from './http'

const MOVEMENTS_PATH = '/inventory-movements'

function buildMovementsQuery(params: MovementsListParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const inventoryMovementsService = {
  list: (params: MovementsListParams, token: string | null) =>
    http.get<MovementsListResponse>(`${MOVEMENTS_PATH}${buildMovementsQuery(params)}`, { token }),

  create: (payload: CreateMovementPayload, token: string | null) =>
    http.post<RegisteredMovement>(MOVEMENTS_PATH, payload, { token }),

  transfer: (payload: CreateTransferPayload, token: string | null) =>
    http.post<RegisteredMovement>(`${MOVEMENTS_PATH}/transfers`, payload, { token }),

  adjust: (payload: CreateAdjustmentPayload, token: string | null) =>
    http.post<RegisteredMovement>(`${MOVEMENTS_PATH}/adjustments`, payload, { token }),
}
