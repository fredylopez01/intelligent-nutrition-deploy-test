import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildProduct } from '../test-utils/products'

import { http } from './http'
import { productsService } from './products.service'

vi.mock('./http', () => ({
  http: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}))

const get = vi.mocked(http.get)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('productsService', () => {
  it('sends every filter of the list', async () => {
    get.mockResolvedValue({ data: [], meta: { page: 2, limit: 20, total: 0, totalPages: 0 } })

    await productsService.list(
      {
        page: 2,
        limit: 20,
        search: 'whey',
        categoryId: 'cat-1',
        unitOfMeasureId: 'unit-1',
        active: false,
      },
      'token',
    )

    expect(get).toHaveBeenCalledWith(
      '/products?page=2&limit=20&search=whey&categoryId=cat-1&unitOfMeasureId=unit-1&active=false',
      { token: 'token' },
    )
  })

  it('reads the product detail even when the api wraps it twice', async () => {
    const product = buildProduct()
    get.mockResolvedValueOnce({ data: product }).mockResolvedValueOnce(product)

    await expect(productsService.getById('product-whey', 'token')).resolves.toEqual(product)
    await expect(productsService.getById('product-whey', 'token')).resolves.toEqual(product)
    expect(get).toHaveBeenCalledWith('/products/product-whey', { token: 'token' })
  })
})
