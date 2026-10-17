import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildInventoryDetail, inventoryPage } from '../test-utils/inventory'

import { http } from './http'
import { inventoryService } from './inventory.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const get = vi.mocked(http.get)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('inventoryService', () => {
  it('lists the inventory of a branch with its filters', async () => {
    get.mockResolvedValue(inventoryPage([]))

    await inventoryService.listByBranch(
      'branch-centro',
      { page: 2, limit: 20, search: 'whey', categoryId: 'cat-protein', lowStock: false },
      'token',
    )

    expect(get).toHaveBeenCalledWith(
      '/branches/branch-centro/inventory?page=2&limit=20&search=whey&categoryId=cat-protein&lowStock=false',
      { token: 'token' },
    )
  })

  it('leaves out the filters that are not set', async () => {
    get.mockResolvedValue(inventoryPage([]))

    await inventoryService.listByBranch('branch-centro', { page: 1, limit: 10 }, 'token')

    expect(get).toHaveBeenCalledWith('/branches/branch-centro/inventory?page=1&limit=10', {
      token: 'token',
    })
  })

  it('unwraps the product of a branch even when the backend wraps it twice', async () => {
    const detail = buildInventoryDetail()
    get.mockResolvedValueOnce({ data: detail }).mockResolvedValueOnce(detail)

    await expect(
      inventoryService.getProductInBranch('branch-centro', 'product-whey', 'token'),
    ).resolves.toEqual(detail)
    await expect(
      inventoryService.getProductInBranch('branch-centro', 'product-whey', 'token'),
    ).resolves.toEqual(detail)
    expect(get).toHaveBeenCalledWith('/branches/branch-centro/inventory/product-whey', {
      token: 'token',
    })
  })
})
