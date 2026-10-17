import { ApiError } from '../services/http'
import type { ProductImage } from '../types/product'

export const MAX_PRODUCT_IMAGES = 5
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',')
export const IMAGE_RULES_TEXT = 'JPG, PNG, WebP o AVIF de máximo 5 MB'

export function sortImages(images: ProductImage[]): ProductImage[] {
  return [...images].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function primaryImage(images: ProductImage[]): ProductImage | undefined {
  return images.find((image) => image.isPrimary) ?? sortImages(images)[0]
}

const sizeFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`
  return `${sizeFormatter.format(bytes / (1024 * 1024))} MB`
}

export function validateImageFile(file: File): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    return 'no es JPG, PNG, WebP ni AVIF'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const size = formatFileSize(file.size)
    return size === '5 MB' ? 'supera el máximo de 5 MB' : `supera el máximo de 5 MB (pesa ${size})`
  }
  if (file.size === 0) {
    return 'está vacío'
  }
  return null
}

export interface RejectedImage {
  fileName: string
  reason: string
}

export function selectImageFiles(
  files: File[],
  availableSlots: number,
): { accepted: File[]; rejected: RejectedImage[] } {
  const accepted: File[] = []
  const rejected: RejectedImage[] = []
  for (const file of files) {
    const reason = validateImageFile(file)
    if (reason) {
      rejected.push({ fileName: file.name, reason })
    } else if (accepted.length >= availableSlots) {
      rejected.push({
        fileName: file.name,
        reason: `no cabe: el producto admite máximo ${MAX_PRODUCT_IMAGES} imágenes`,
      })
    } else {
      accepted.push(file)
    }
  }
  return { accepted, rejected }
}

export function resolveImageError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'UPLOAD_FAILED':
      return 'No se pudo subir el archivo al almacenamiento. Revisa tu conexión e intenta de nuevo.'
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'El tipo de archivo no está permitido. Usa JPG, PNG, WebP o AVIF.'
    case 'FILE_TOO_LARGE':
      return 'La imagen supera el máximo de 5 MB.'
    case 'IMAGE_LIMIT_REACHED':
      return `El producto ya tiene ${MAX_PRODUCT_IMAGES} imágenes. Elimina una para subir otra.`
    case 'INVALID_FILE_CONTENT':
      return 'El contenido del archivo no corresponde a una imagen válida, aunque su extensión lo parezca.'
    case 'STORAGE_OBJECT_NOT_FOUND':
      return 'El archivo no llegó al almacenamiento. Intenta subirlo de nuevo.'
    case 'STORAGE_KEY_MISMATCH':
    case 'STORAGE_KEY_ALREADY_EXISTS':
      return 'La subida no se pudo confirmar. Intenta subir la imagen de nuevo.'
    case 'PRIMARY_IMAGE_REQUIRED':
      return 'El producto debe tener una imagen principal. Marca otra como principal primero.'
  }
  if (error.status === 403) return 'No tienes permiso para gestionar las imágenes de este producto.'
  if (error.status === 404) return 'La imagen o el producto ya no existen. Recarga la página.'
  if (error.status === 400) return 'El servidor no aceptó los datos de la imagen.'
  return fallback
}
