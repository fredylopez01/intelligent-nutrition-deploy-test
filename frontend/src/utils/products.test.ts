import { describe, expect, it } from 'vitest'

import { formatPrice } from './products'

describe('product prices', () => {
  it('formats whole prices without decimals and others with two', () => {
    const plain = (value: string) => value.replace(/\s/g, ' ')
    expect(plain(formatPrice('145000.00'))).toBe('$ 145.000')
    expect(plain(formatPrice('89900.50'))).toBe('$ 89.900,50')
    expect(formatPrice('no-es-precio')).toBe('—')
  })
})
