import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { inventoryClosuresService } from './inventoryClosures.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return {
    ...original,
    http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('inventoryClosuresService', () => {
  it('starts the closure of a branch without body', async () => {
    vi.mocked(http.post).mockResolvedValue({})

    await inventoryClosuresService.start('branch-centro', 'token')

    expect(http.post).toHaveBeenCalledWith(
      '/branches/branch-centro/inventory-closures',
      undefined,
      {
        token: 'token',
      },
    )
  })

  it('reads a closure', async () => {
    vi.mocked(http.get).mockResolvedValue({})

    await inventoryClosuresService.get('closure-1', 'token')

    expect(http.get).toHaveBeenCalledWith('/inventory-closures/closure-1', { token: 'token' })
  })

  it('lists with the branch, status and date filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await inventoryClosuresService.list(
      { page: 1, limit: 10, branchId: 'branch-centro', status: 'CONFIRMED', from: '2026-10-01' },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/inventory-closures?page=1&limit=10&branchId=branch-centro&status=CONFIRMED&from=2026-10-01',
      { token: 'token' },
    )
  })

  it('saves the counts of each lot', async () => {
    vi.mocked(http.put).mockResolvedValue({})
    const items = [{ productId: 'product-whey', expirationDate: '2027-06-30', physicalQuantity: 7 }]

    await inventoryClosuresService.saveCounts('closure-1', items, 'token')

    expect(http.put).toHaveBeenCalledWith(
      '/inventory-closures/closure-1/counts',
      { items },
      {
        token: 'token',
      },
    )
  })
})
