import type { ProductImage } from '../types/product'

export const MAX_PRODUCT_IMAGES = 5
export const IMAGE_RULES_TEXT = 'JPG, PNG, WebP o AVIF de máximo 5 MB'

export function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function primaryImage(images: ProductImage[]): ProductImage | undefined {
  return images.find((image) => image.isPrimary) ?? sortImages(images)[0]
}
