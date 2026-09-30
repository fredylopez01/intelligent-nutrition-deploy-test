import type { CreateSupplierPayload, Supplier } from '../types/supplier'

import { http } from './http'

export const suppliersService = {
  create: (payload: CreateSupplierPayload, token: string | null): Promise<Supplier> =>
    http.post<Supplier>('/suppliers', payload, { token }),
}
