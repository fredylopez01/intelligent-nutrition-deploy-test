import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generalStockService } from './generalStock.service'
import { http } from './http'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('generalStockService', () => {
  it('reads the general stock lots of a product', async () => {
    vi.mocked(http.get).mockResolvedValue({ lots: [] })

    await generalStockService.getByProduct('product-whey', 'token')

    expect(http.get).toHaveBeenCalledWith('/general-stock/product-whey', { token: 'token' })
  })

  it('adjusts the general stock of a product with its reason', async () => {
    vi.mocked(http.post).mockResolvedValue({ lots: [] })
    const payload = {
      quantity: 10,
      movementType: 'ADJUSTMENT_ENTRY' as const,
      reason: 'Conteo físico del almacén central',
    }

    await generalStockService.restock('product-whey', payload, 'token')

    expect(http.post).toHaveBeenCalledWith('/general-stock/product-whey/restock', payload, {
      token: 'token',
    })
  })
})
