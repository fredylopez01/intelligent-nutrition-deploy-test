import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import {
  expirationLabel,
  expirationState,
  formatExpirationDate,
  formatQuantity,
  resolveInventoryError,
  todayInputValue,
} from './inventory'

const today = new Date(2026, 9, 16, 21, 30)

describe('inventory helpers', () => {
  it('formats quantities with the unit', () => {
    expect(formatQuantity(1500, 'und')).toBe('1.500 und')
    expect(formatQuantity(0)).toBe('0')
  })

  it('shows the expiration date without moving it to the previous day', () => {
    expect(formatExpirationDate('2026-12-31T00:00:00Z')).toBe('31 dic 2026')
    expect(formatExpirationDate('2026-06-01T00:00:00Z')).toBe('1 jun 2026')
    expect(formatExpirationDate('no-date')).toBe('Sin fecha')
  })

  it('uses the local day for the date input limit', () => {
    expect(todayInputValue(today)).toBe('2026-10-16')
  })

  it('classifies lots by how close they are to expire', () => {
    expect(expirationState('2026-10-15T00:00:00Z', today)).toEqual({ state: 'expired', days: -1 })
    expect(expirationState('2026-10-16T00:00:00Z', today)).toEqual({ state: 'soon', days: 0 })
    expect(expirationState('2026-11-15T00:00:00Z', today)).toEqual({ state: 'soon', days: 30 })
    expect(expirationState('2026-11-16T00:00:00Z', today)).toEqual({ state: 'ok', days: 31 })
  })

  it('describes the expiration in words', () => {
    expect(expirationLabel('2026-10-10T00:00:00Z', today)).toBe('Venció hace 6 días')
    expect(expirationLabel('2026-10-15T00:00:00Z', today)).toBe('Venció ayer')
    expect(expirationLabel('2026-10-16T00:00:00Z', today)).toBe('Vence hoy')
    expect(expirationLabel('2026-10-17T00:00:00Z', today)).toBe('Vence mañana')
    expect(expirationLabel('2026-10-30T00:00:00Z', today)).toBe('Vence en 14 días')
    expect(expirationLabel('2027-01-30T00:00:00Z', today)).toBe('Vigente')
  })

  it('explains the inventory errors of the contract', () => {
    const resolve = (code: string, status: number) =>
      resolveInventoryError(new ApiError('x', status, undefined, code), 'fallback')

    expect(resolve('BRANCH_INACTIVE', 422)).toContain('La sede está inactiva')
    expect(resolve('BRANCH_OUT_OF_SCOPE', 403)).toContain('No tienes acceso al inventario')
    expect(resolve('BRANCH_SCOPE_VIOLATION', 403)).toContain('No tienes acceso al inventario')
    expect(resolve('PRODUCT_NOT_ASSIGNED', 404)).toContain('ya no está asignado a la sede')
    expect(resolve('SEARCH_TOO_SHORT', 400)).toBe('Escribe al menos 2 caracteres para buscar.')
    expect(resolveInventoryError(new Error('x'), 'fallback')).toBe('fallback')
  })
})
