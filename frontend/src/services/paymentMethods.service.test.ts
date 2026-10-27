import { beforeEach, describe, expect, it, vi } from 'vitest'

import { http } from './http'
import { paymentMethodsService } from './paymentMethods.service'

vi.mock('./http', async (importOriginal) => {
  const original = await importOriginal<typeof import('./http')>()
  return { ...original, http: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }
})

beforeEach(() => {
  vi.resetAllMocks()
})

describe('paymentMethodsService', () => {
  it('lists with pagination, search and state filters', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await paymentMethodsService.list(
      { page: 2, limit: 20, search: 'nequi', active: false },
      'token',
    )

    expect(http.get).toHaveBeenCalledWith(
      '/payment-methods?page=2&limit=20&search=nequi&active=false',
      { token: 'token' },
    )
  })

  it('omits the filters that were not sent', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: [], meta: {} })

    await paymentMethodsService.list({}, 'token')

    expect(http.get).toHaveBeenCalledWith('/payment-methods', { token: 'token' })
  })
})
