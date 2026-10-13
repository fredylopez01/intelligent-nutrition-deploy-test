import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import {
  formatPrice,
  isValidPrice,
  productFieldError,
  productSchema,
  toPriceInput,
  toPriceString,
} from './products'

const validProduct = {
  name: 'Whey Protein 2 lb',
  referenceCode: 'WHEY-2LB-001',
  description: '',
  categoryId: 'cat-1',
  unitOfMeasureId: 'unit-1',
  price: '145000',
}

describe('product prices', () => {
  it('formats whole prices without decimals and others with two', () => {
    const plain = (value: string) => value.replace(/\s/g, ' ')
    expect(plain(formatPrice('145000.00'))).toBe('$ 145.000')
    expect(plain(formatPrice('89900.50'))).toBe('$ 89.900,50')
    expect(formatPrice('no-es-precio')).toBe('—')
  })

  it('sends the price with two decimals, accepting a comma', () => {
    expect(toPriceString('145000')).toBe('145000.00')
    expect(toPriceString(' 89900,5 ')).toBe('89900.50')
  })

  it('shows a whole price without decimals in the form', () => {
    expect(toPriceInput('145000.00')).toBe('145000')
    expect(toPriceInput('89900.50')).toBe('89900.50')
  })

  it.each([
    ['0', true],
    ['145000', true],
    ['145000.5', true],
    ['145000,55', true],
    ['145.000', false],
    ['145000.555', false],
    ['-5', false],
    ['1.000.000', false],
    ['abc', false],
    ['12345678901', false],
  ])('validates the price "%s"', (price, valid) => {
    expect(isValidPrice(price)).toBe(valid)
  })
})

describe('productSchema', () => {
  it('accepts a complete product', () => {
    expect(productSchema.safeParse(validProduct).success).toBe(true)
  })

  it.each([
    ['W', false],
    ['WHEY 2LB', false],
    ['WHEY/2LB', false],
    ['W'.repeat(51), false],
    ['whey_2lb-001', true],
  ])('validates the reference code "%s"', (referenceCode, valid) => {
    expect(productSchema.safeParse({ ...validProduct, referenceCode }).success).toBe(valid)
  })

  it('requires the category, the unit and the price', () => {
    const result = productSchema.safeParse({
      ...validProduct,
      categoryId: '',
      unitOfMeasureId: '',
      price: '',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(
      expect.arrayContaining(['categoryId', 'unitOfMeasureId', 'price']),
    )
  })
})

describe('productFieldError', () => {
  it.each([
    ['PRODUCT_REFERENCE_CODE_ALREADY_EXISTS', 'referenceCode'],
    ['CATEGORY_INACTIVE', 'categoryId'],
    ['CATEGORY_NOT_FOUND', 'categoryId'],
    ['UNIT_INACTIVE', 'unitOfMeasureId'],
    ['UNIT_NOT_FOUND', 'unitOfMeasureId'],
  ])('places %s on the %s field', (code, field) => {
    expect(productFieldError(new ApiError('error', 409, {}, code))?.field).toBe(field)
  })

  it('ignores other errors', () => {
    expect(productFieldError(new ApiError('error', 500))).toBeNull()
    expect(productFieldError(new Error('boom'))).toBeNull()
  })
})
