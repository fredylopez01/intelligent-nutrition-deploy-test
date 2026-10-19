import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'
import type { ProductImage } from '../types/product'

import {
  formatFileSize,
  primaryImage,
  resolveImageError,
  selectImageFiles,
  sortImages,
  validateImageFile,
} from './productImages'

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

function file(name: string, type: string, size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('product image helpers', () => {
  it('orders the images by sort order and finds the primary one', () => {
    const images = [image('c', 2), image('a', 0), image('b', 1, true)]

    expect(sortImages(images).map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(primaryImage(images)?.id).toBe('b')
    expect(primaryImage([image('c', 2), image('a', 0)])?.id).toBe('a')
    expect(primaryImage([])).toBeUndefined()
  })

  it('formats file sizes for people', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(184320)).toBe('180 KB')
    expect(formatFileSize(4.2 * 1024 * 1024)).toBe('4,2 MB')
  })

  it('accepts only JPG, PNG, WebP and AVIF up to 5 MB', () => {
    expect(validateImageFile(file('a.jpg', 'image/jpeg'))).toBeNull()
    expect(validateImageFile(file('a.png', 'image/png'))).toBeNull()
    expect(validateImageFile(file('a.webp', 'image/webp'))).toBeNull()
    expect(validateImageFile(file('a.avif', 'image/avif'))).toBeNull()
    expect(validateImageFile(file('a.gif', 'image/gif'))).toBe('no es JPG, PNG, WebP ni AVIF')
    expect(validateImageFile(file('a.png', 'image/png', 5 * 1024 * 1024))).toBeNull()
    expect(validateImageFile(file('a.png', 'image/png', 5 * 1024 * 1024 + 1))).toBe(
      'supera el máximo de 5 MB',
    )
    expect(validateImageFile(file('a.png', 'image/png', 0))).toBe('está vacío')
  })

  it('keeps only the files that fit in the free slots', () => {
    const { accepted, rejected } = selectImageFiles(
      [file('a.png', 'image/png'), file('b.txt', 'text/plain'), file('c.png', 'image/png')],
      1,
    )

    expect(accepted.map((item) => item.name)).toEqual(['a.png'])
    expect(rejected).toEqual([
      { fileName: 'b.txt', reason: 'no es JPG, PNG, WebP ni AVIF' },
      { fileName: 'c.png', reason: 'no cabe: el producto admite máximo 5 imágenes' },
    ])
  })

  it('explains the image errors of the contract', () => {
    const resolve = (code: string, status = 422) =>
      resolveImageError(new ApiError('x', status, undefined, code), 'fallback')

    expect(resolve('IMAGE_LIMIT_REACHED')).toContain('ya tiene 5 imágenes')
    expect(resolve('INVALID_FILE_CONTENT')).toContain('no corresponde a una imagen válida')
    expect(resolve('STORAGE_OBJECT_NOT_FOUND', 404)).toContain('no llegó al almacenamiento')
    expect(resolve('UPLOAD_FAILED', 0)).toContain('No se pudo subir el archivo')
    expect(resolve('PRIMARY_IMAGE_REQUIRED', 409)).toContain('debe tener una imagen principal')
    expect(resolveImageError(new ApiError('x', 403), 'fallback')).toContain('No tienes permiso')
    expect(resolveImageError(new Error('x'), 'fallback')).toBe('fallback')
  })
})
