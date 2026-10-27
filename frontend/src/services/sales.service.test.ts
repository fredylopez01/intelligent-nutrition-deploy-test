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
})
