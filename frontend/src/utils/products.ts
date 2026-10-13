import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'

export const PRODUCT_MANAGE_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER']

export const PRODUCT_NAME_MAX_LENGTH = 150
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000
export const REFERENCE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/

export function productPath(productId: string): string {
  return `/catalogo/productos/${productId}`
}

const PRICE_PATTERN = /^\d{1,10}([.,]\d{1,2})?$/

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

export function toPriceString(price: string): string {
  return Number(price.trim().replace(',', '.')).toFixed(2)
}

export function toPriceInput(price: string): string {
  const value = Number(price)
  return Number.isInteger(value) ? String(value) : price
}

export function isValidPrice(price: string): boolean {
  return PRICE_PATTERN.test(price.trim())
}

export const productFieldsSchema = {
  name: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre del producto')
    .max(
      PRODUCT_NAME_MAX_LENGTH,
      `El nombre no puede superar ${PRODUCT_NAME_MAX_LENGTH} caracteres`,
    ),
  description: z
    .string()
    .trim()
    .max(
      PRODUCT_DESCRIPTION_MAX_LENGTH,
      `La descripción no puede superar ${PRODUCT_DESCRIPTION_MAX_LENGTH} caracteres`,
    ),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  unitOfMeasureId: z.string().min(1, 'Selecciona una unidad de medida'),
  price: z
    .string()
    .trim()
    .min(1, 'Ingresa el precio')
    .refine(isValidPrice, 'Escribe el precio con números, sin puntos de miles y hasta 2 decimales'),
}

export const referenceCodeSchema = z
  .string()
  .trim()
  .min(2, 'El código debe tener entre 2 y 50 caracteres')
  .max(50, 'El código debe tener entre 2 y 50 caracteres')
  .regex(REFERENCE_CODE_PATTERN, 'Usa solo letras, números, guiones (-) o guion bajo (_)')

export type ProductFieldErrorKey = 'referenceCode' | 'categoryId' | 'unitOfMeasureId'

export function productFieldError(
  error: unknown,
): { field: ProductFieldErrorKey; message: string } | null {
  if (!(error instanceof ApiError)) return null
  switch (error.code) {
    case 'PRODUCT_REFERENCE_CODE_ALREADY_EXISTS':
      return {
        field: 'referenceCode',
        message: 'Ese código de referencia ya lo tiene otro producto. Usa uno diferente.',
      }
    case 'CATEGORY_INACTIVE':
      return {
        field: 'categoryId',
        message: 'Esta categoría se desactivó. Elige otra categoría activa.',
      }
    case 'CATEGORY_NOT_FOUND':
      return { field: 'categoryId', message: 'Esta categoría ya no existe. Elige otra.' }
    case 'UNIT_INACTIVE':
      return {
        field: 'unitOfMeasureId',
        message: 'Esta unidad se desactivó. Elige otra unidad activa.',
      }
    case 'UNIT_NOT_FOUND':
      return { field: 'unitOfMeasureId', message: 'Esta unidad ya no existe. Elige otra.' }
  }
  return null
}

export function resolveProductError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
    case 'FIELD_NOT_EDITABLE':
      return 'El código de referencia no se puede cambiar después de crear el producto.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'Este producto ya no existe. Recarga el listado.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}

export const productSchema = z.object({
  ...productFieldsSchema,
  referenceCode: referenceCodeSchema,
})

export type ProductFormValues = z.infer<typeof productSchema>
