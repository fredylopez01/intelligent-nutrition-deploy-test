import { z } from 'zod'

import { ApiError } from '../services/http'
import type { RoleName } from '../types/auth'

export const PAYMENT_METHOD_MANAGE_ROLES: RoleName[] = ['SUPERADMIN']

export const PAYMENT_METHOD_CODE_MAX_LENGTH = 30
export const PAYMENT_METHOD_NAME_MIN_LENGTH = 3
export const PAYMENT_METHOD_NAME_MAX_LENGTH = 100

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre del método de pago')
  .min(
    PAYMENT_METHOD_NAME_MIN_LENGTH,
    `El nombre debe tener al menos ${PAYMENT_METHOD_NAME_MIN_LENGTH} caracteres`,
  )
  .max(
    PAYMENT_METHOD_NAME_MAX_LENGTH,
    `El nombre no puede superar ${PAYMENT_METHOD_NAME_MAX_LENGTH} caracteres`,
  )

export const createPaymentMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Ingresa el código del método de pago')
    .max(
      PAYMENT_METHOD_CODE_MAX_LENGTH,
      `El código no puede superar ${PAYMENT_METHOD_CODE_MAX_LENGTH} caracteres`,
    )
    .regex(/^\S+$/, 'El código no lleva espacios. Usa guion bajo, por ejemplo BANK_TRANSFER.')
    .transform((value) => value.toUpperCase())
    .pipe(
      z
        .string()
        .regex(/^[A-Z0-9_]+$/, 'Usa solo letras sin tilde, números y guion bajo (A-Z, 0-9, _).'),
    ),
  name: nameSchema,
})

export type CreatePaymentMethodValues = z.input<typeof createPaymentMethodSchema>
export type CreatePaymentMethodData = z.output<typeof createPaymentMethodSchema>

export const editPaymentMethodSchema = z.object({ name: nameSchema })

export type EditPaymentMethodValues = z.infer<typeof editPaymentMethodSchema>

export type PaymentMethodConflictField = 'code' | 'name'

export function paymentMethodConflict(
  error: unknown,
): { field: PaymentMethodConflictField; message: string } | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'PAYMENT_METHOD_CODE_ALREADY_EXISTS') {
    return { field: 'code', message: 'Ya existe un método de pago con ese código. Usa otro.' }
  }
  if (error.code === 'PAYMENT_METHOD_NAME_ALREADY_EXISTS') {
    return { field: 'name', message: 'Ya existe un método de pago con ese nombre. Usa otro.' }
  }
  return null
}

export function resolvePaymentMethodError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback
  const conflict = paymentMethodConflict(error)
  if (conflict) return conflict.message
  switch (error.code) {
    case 'ALREADY_IN_STATE':
      return 'El método de pago ya tenía ese estado. Recarga el listado para ver su estado actual.'
    case 'PAYMENT_METHOD_NOT_FOUND':
      return 'Este método de pago ya no existe. Recarga el listado.'
  }
  if (error.status === 403) return 'No tienes permiso para realizar esta acción.'
  if (error.status === 404) return 'Este método de pago ya no existe. Recarga el listado.'
  if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
  return fallback
}
