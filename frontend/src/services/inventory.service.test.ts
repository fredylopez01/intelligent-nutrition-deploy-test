import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildInventoryDetail, inventoryPage } from '../test-utils/inventory'

import { http } from './http'
import { inventoryService } from './inventory.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

const get = vi.mocked(http.get)
const post = vi.mocked(http.post)
const patch = vi.mocked(http.patch)

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

  it('assigns a lot to a branch and unwraps the created lot', async () => {
    const lot = { id: 'lot-3', quantity: 20 }
    post.mockResolvedValue({ data: lot })
    const payload = {
      productId: 'product-whey',
      quantity: 20,
      minimumStock: 5,
      expirationDate: '2026-12-31T00:00:00Z',
    }

    await expect(inventoryService.assign('branch-centro', payload, 'token')).resolves.toEqual(lot)
    expect(post).toHaveBeenCalledWith('/branches/branch-centro/inventory', payload, {
      token: 'token',
    })
  })

  it('changes the minimum stock of a product in a branch', async () => {
    const result = { minimumStock: 8, lowStock: false, lotsUpdated: 2 }
    patch.mockResolvedValue({ data: result })

    await expect(
      inventoryService.updateMinimumStock('branch-centro', 'product-whey', 8, 'token'),
    ).resolves.toEqual(result)
    expect(patch).toHaveBeenCalledWith(
      '/branches/branch-centro/inventory/product-whey',
      { minimumStock: 8 },
      { token: 'token' },
    )
  })
})
