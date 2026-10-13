import { ApiError } from '../services/http'

export function productPath(productId: string): string {
  return `/catalogo/productos/${productId}`
}

const wholePriceFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const centsPriceFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPrice(price: string | number): string {
  const value = typeof price === 'number' ? price : Number(price)
  if (!Number.isFinite(value)) return '—'
  return Number.isInteger(value)
    ? wholePriceFormatter.format(value)
    : centsPriceFormatter.format(value)
}

export function resolveProductError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'Este producto ya no existe. Recarga el listado.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}
