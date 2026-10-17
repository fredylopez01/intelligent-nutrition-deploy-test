import { describe, expect, it } from 'vitest'

import type { ProductImage } from '../types/product'

import { primaryImage, sortImages } from './productImages'

function image(id: string, sortOrder: number, isPrimary = false): ProductImage {
  return {
    id,
    url: `https://cdn.example.com/${id}.webp`,
    fileName: `${id}.webp`,
    mimeType: 'image/webp',
    sizeBytes: 1000,
    isPrimary,
    sortOrder,
  }
}

describe('product image helpers', () => {
  it('orders the images by sort order and finds the primary one', () => {
    const images = [image('c', 2), image('a', 0), image('b', 1, true)]

    expect(sortImages(images).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(primaryImage(images)?.id).toBe('b')
    expect(primaryImage([image('c', 2), image('a', 0)])?.id).toBe('a')
    expect(primaryImage([])).toBeUndefined()
  })
})
