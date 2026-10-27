import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { inventoryMovementsService } from './inventoryMovements.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('inventoryMovementsService', () => {
  it('lists with every filter of the contract and skips the empty ones', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await inventoryMovementsService.list(
      {
        page: 2,
        limit: 20,
        branchId: 'branch-centro',
        productId: 'product-whey',
        movementType: 'EXIT',
        from: '2026-10-01',
        to: '2026-10-26',
        userId: undefined,
      },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/inventory-movements?page=2&limit=20&branchId=branch-centro&productId=product-whey&movementType=EXIT&from=2026-10-01&to=2026-10-26',
      { token: 'token' },
    )
  })

  it('registers an entry or exit', async () => {
    vi.mocked(http.post).mockResolvedValue({})
    const payload = {
      branchId: 'branch-centro',
      productId: 'product-whey',
      movementType: 'EXIT' as const,
      quantity: 3,
      expirationDate: '2027-01-31',
      observation: 'Empaque roto',
    }

    await inventoryMovementsService.create(payload, 'token')

    expect(http.post).toHaveBeenCalledWith('/inventory-movements', payload, { token: 'token' })
  })

  it('registers a transfer', async () => {
    vi.mocked(http.post).mockResolvedValue({})
    const payload = {
      originBranchId: 'branch-centro',
      branchId: 'branch-norte',
      productId: 'product-whey',
      quantity: 2,
    }

    await inventoryMovementsService.transfer(payload, 'token')

    expect(http.post).toHaveBeenCalledWith('/inventory-movements/transfers', payload, {
      token: 'token',
    })
  })
})
