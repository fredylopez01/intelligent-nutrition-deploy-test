import { z } from 'zod'

import { categoriesService } from '../services/categories.service'
import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'
import type { Category } from '../types/category'

export const CATEGORY_MANAGE_ROLES: RoleName[] = ['SUPERADMIN', 'BRANCH_LEADER']
export const CATEGORY_STATUS_ROLES: RoleName[] = ['SUPERADMIN']

export const CATEGORY_NAME_MIN_LENGTH = 3
export const CATEGORY_NAME_MAX_LENGTH = 100
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 255

export function hasRole(roles: RoleName[], roleName: string | undefined): boolean {
  return roleName !== undefined && (roles as string[]).includes(roleName)
}

export function normalizeCategoryName(name: string): string {
  return name.trim().toLocaleLowerCase('es')
}

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre de la categoría')
    .min(
      CATEGORY_NAME_MIN_LENGTH,
      `El nombre debe tener al menos ${CATEGORY_NAME_MIN_LENGTH} caracteres`,
    )
    .max(
      CATEGORY_NAME_MAX_LENGTH,
      `El nombre no puede superar ${CATEGORY_NAME_MAX_LENGTH} caracteres`,
    ),
  description: z
    .string()
    .trim()
    .min(1, 'Ingresa una descripción')
    .max(
      CATEGORY_DESCRIPTION_MAX_LENGTH,
      `La descripción no puede superar ${CATEGORY_DESCRIPTION_MAX_LENGTH} caracteres`,
    ),
})

export type CategoryFormValues = z.infer<typeof categorySchema>

export function duplicateNameMessage(category: Category): string {
  return `Ya existe la categoría "${category.name}". Usa un nombre diferente.`
}

export async function findCategoryWithName(
  name: string,
  token: string | null,
  excludeId?: string,
): Promise<Category | null> {
  const target = normalizeCategoryName(name)
  try {
    const response = await categoriesService.list({ search: name.trim(), limit: 100 }, token)
    return (
      response.data.find(
        (category) => category.id !== excludeId && normalizeCategoryName(category.name) === target,
      ) ?? null
    )
  } catch {
    return null
  }
}

export function isDuplicateNameError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'CATEGORY_NAME_ALREADY_EXISTS' || error.status === 409)
  )
}

export function resolveCategoryError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'CATEGORY_NAME_ALREADY_EXISTS':
      return 'Ya existe una categoría con ese nombre. Usa uno diferente.'
    case 'ALREADY_IN_STATE':
      return 'La categoría ya tenía ese estado. Recarga el listado para ver su estado actual.'
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 409) return 'Ya existe una categoría con ese nombre. Usa uno diferente.'
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'Esta categoría ya no existe. Recarga el listado.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}
