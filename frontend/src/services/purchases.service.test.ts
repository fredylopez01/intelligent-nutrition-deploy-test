import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { purchasesService } from './purchases.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('purchasesService', () => {
  it('lists with the contract filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await purchasesService.list(
      { page: 1, limit: 20, supplierId: 'supplier-1', status: 'PENDING_RECEIPT', search: 'C-2026' },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/purchases?page=1&limit=20&supplierId=supplier-1&status=PENDING_RECEIPT&search=C-2026',
      { token: 'token' },
    )
  })

  it('reads one purchase', async () => {
    vi.mocked(http.get).mockResolvedValue({})

    await purchasesService.get('purchase-1', 'token')

    expect(http.get).toHaveBeenCalledWith('/purchases/purchase-1', { token: 'token' })
  })

  it('creates a purchase order', async () => {
    vi.mocked(http.post).mockResolvedValue({})
    const payload = {
      supplierId: 'supplier-1',
      items: [{ productId: 'product-whey', requestedQuantity: 20, unitPrice: '98000.00' }],
    }

    await purchasesService.create(payload, 'token')

    expect(http.post).toHaveBeenCalledWith('/purchases', payload, { token: 'token' })
  })
})
