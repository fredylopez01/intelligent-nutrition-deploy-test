import { z } from 'zod'

import { ApiError } from '../services/http'
import { unitsService } from '../services/units.service'
import type { RoleName } from '../types/auth'
import type { UnitOfMeasure } from '../types/unit'

export const UNIT_MANAGE_ROLES: RoleName[] = ['SUPERADMIN']

export const UNIT_NAME_MIN_LENGTH = 5
export const UNIT_NAME_MAX_LENGTH = 50
export const UNIT_ABBREVIATION_MAX_LENGTH = 10

const CONFLICT_LOOKUP_LIMIT = 100
const CONFLICT_LOOKUP_MAX_PAGES = 10

export const unitSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre de la unidad')
    .min(UNIT_NAME_MIN_LENGTH, `El nombre debe tener al menos ${UNIT_NAME_MIN_LENGTH} caracteres`)
    .max(UNIT_NAME_MAX_LENGTH, `El nombre no puede superar ${UNIT_NAME_MAX_LENGTH} caracteres`),
  abbreviation: z
    .string()
    .trim()
    .min(1, 'Ingresa la abreviatura')
    .max(
      UNIT_ABBREVIATION_MAX_LENGTH,
      `La abreviatura no puede superar ${UNIT_ABBREVIATION_MAX_LENGTH} caracteres`,
    )
    .regex(/^\S+$/, 'La abreviatura no lleva espacios'),
})

export type UnitFormValues = z.infer<typeof unitSchema>

export type UnitConflictField = 'name' | 'abbreviation'

export interface UnitConflict {
  field: UnitConflictField
  unit: UnitOfMeasure
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('es')
}

export const UNIT_API_CONFLICT_MESSAGES: Record<UnitConflictField, string> = {
  name: 'Ya existe una unidad con ese nombre. Usa uno diferente.',
  abbreviation: 'Esa abreviatura ya la usa otra unidad. Usa una diferente.',
}

export function unitConflictMessage({ field, unit }: UnitConflict): string {
  return field === 'name'
    ? `Ya existe la unidad "${unit.name}". Usa un nombre diferente.`
    : `La abreviatura "${unit.abbreviation}" ya la usa la unidad ${unit.name}.`
}

export async function findUnitConflict(
  values: UnitFormValues,
  token: string | null,
  excludeId?: string,
): Promise<UnitConflict | null> {
  const name = normalize(values.name)
  const abbreviation = normalize(values.abbreviation)
  try {
    for (let page = 1; page <= CONFLICT_LOOKUP_MAX_PAGES; page += 1) {
      const response = await unitsService.list({ page, limit: CONFLICT_LOOKUP_LIMIT }, token)
      for (const unit of response.data) {
        if (unit.id === excludeId) continue
        if (normalize(unit.name) === name) return { field: 'name', unit }
        if (normalize(unit.abbreviation) === abbreviation) return { field: 'abbreviation', unit }
      }
      if (page >= response.meta.totalPages) break
    }
  } catch {
    return null
  }
  return null
}

export function apiConflictField(error: unknown): UnitConflictField | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'UNIT_NAME_ALREADY_EXISTS') return 'name'
  if (error.code === 'UNIT_ABBREVIATION_ALREADY_EXISTS') return 'abbreviation'
  if (error.status === 409 && error.code !== 'ALREADY_IN_STATE') {
    return /abreviation|abbreviation/i.test(error.message) ? 'abbreviation' : 'name'
  }
  return null
}

export function resolveUnitError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  switch (error.code) {
    case 'UNIT_NAME_ALREADY_EXISTS':
      return 'Ya existe una unidad con ese nombre. Usa uno diferente.'
    case 'UNIT_ABBREVIATION_ALREADY_EXISTS':
      return 'Esa abreviatura ya la usa otra unidad. Usa una diferente.'
    case 'ALREADY_IN_STATE':
      return 'La unidad ya tenía ese estado. Recarga el listado para ver su estado actual.'
    case 'SEARCH_TOO_SHORT':
      return 'Escribe al menos 2 caracteres para buscar.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'Esta unidad ya no existe. Recarga el listado.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}
