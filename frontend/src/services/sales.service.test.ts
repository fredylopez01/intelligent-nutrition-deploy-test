import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { salesService } from './sales.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('salesService', () => {
  it('reads the sellable products of a branch with its filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await salesService.sellableProducts(
      'branch-centro',
      { page: 2, limit: 12, search: 'whey', categoryId: 'cat-protein' },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/branches/branch-centro/sellable-products?page=2&limit=12&search=whey&categoryId=cat-protein',
      { token: 'token' },
    )
  })

  it('lists the sales with the contract filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await salesService.list(
      { page: 1, limit: 20, branchId: 'branch-centro', status: 'REVERSED', search: 'V-2026' },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/sales?page=1&limit=20&branchId=branch-centro&status=REVERSED&search=V-2026',
      { token: 'token' },
    )
  })

  it('reads one sale', async () => {
    vi.mocked(http.get).mockResolvedValue({})

    await salesService.get('sale-1', 'token')

    expect(http.get).toHaveBeenCalledWith('/sales/sale-1', { token: 'token' })
  })

  it('reverses a sale with its reason', async () => {
    vi.mocked(http.post).mockResolvedValue({})

    await salesService.reverse('sale-1', 'El cliente pidió otro sabor', 'token')

    expect(http.post).toHaveBeenCalledWith(
      '/sales/sale-1/reverse',
      { reason: 'El cliente pidió otro sabor' },
      { token: 'token' },
    )
  })

  it('registers a sale with its items and payments', async () => {
    vi.mocked(http.post).mockResolvedValue({})
    const payload = {
      branchId: 'branch-centro',
      items: [{ productId: 'product-whey', quantity: 2 }],
      payments: [{ paymentMethodId: 'pm-cash', amount: '290000.00', reference: null }],
    }

    await salesService.create(payload, 'token')

    expect(http.post).toHaveBeenCalledWith('/sales', payload, { token: 'token' })
  })
})
