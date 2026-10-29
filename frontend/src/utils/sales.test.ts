import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import { centsToAmount, selectionTotalCents, stockShortages, toCents } from './sales'

describe('sale helpers', () => {
  it('adds the lines in cents to avoid rounding errors', () => {
    const lines = [
      { product: { price: '19.99' }, quantity: 3 },
      { product: { price: '0.10' }, quantity: 2 },
    ]

    expect(selectionTotalCents(lines)).toBe(6017)
    expect(centsToAmount(6017)).toBe('60.17')
    expect(toCents('145000.00')).toBe(14500000)
  })

  it('reads the products without enough stock from the api error', () => {
    const shortage = { productName: 'Creatina 300 g', requested: 4, available: 1 }

    expect(
      stockShortages(new ApiError('Short', 422, { items: [shortage] }, 'INSUFFICIENT_STOCK')),
    ).toEqual([shortage])
    expect(stockShortages(new ApiError('Closed', 422, {}, 'INVENTORY_CLOSED'))).toEqual([])
  })
})
