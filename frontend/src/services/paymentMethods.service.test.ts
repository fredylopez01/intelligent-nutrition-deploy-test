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

  it('creates a payment method with its code and name', async () => {
    vi.mocked(http.post).mockResolvedValue({ id: 'pm-1' })

    await paymentMethodsService.create({ code: 'DAVIPLATA', name: 'Daviplata' }, 'token')

    expect(http.post).toHaveBeenCalledWith(
      '/payment-methods',
      { code: 'DAVIPLATA', name: 'Daviplata' },
      { token: 'token' },
    )
  })

  it('updates only the name', async () => {
    vi.mocked(http.patch).mockResolvedValue({ id: 'pm-1' })

    await paymentMethodsService.update('pm-1', { name: 'Nequi QR' }, 'token')

    expect(http.patch).toHaveBeenCalledWith(
      '/payment-methods/pm-1',
      { name: 'Nequi QR' },
      { token: 'token' },
    )
  })

  it('changes the state through the status endpoint', async () => {
    vi.mocked(http.patch).mockResolvedValue({ message: 'ok' })

    await paymentMethodsService.updateStatus('pm-1', { active: false }, 'token')

    expect(http.patch).toHaveBeenCalledWith(
      '/payment-methods/pm-1/status',
      { active: false },
      { token: 'token' },
    )
  })
})
