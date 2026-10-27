import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import {
  businessToday,
  countError,
  differenceLabel,
  formatClosureDay,
  resolveClosureError,
} from './inventoryClosures'

describe('inventory closure helpers', () => {
  it('uses the Bogota calendar day', () => {
    expect(businessToday(new Date('2026-10-27T03:00:00.000Z'))).toBe('2026-10-26')
    expect(businessToday(new Date('2026-10-27T05:00:00.000Z'))).toBe('2026-10-27')
  })

  it('formats the closure day with its weekday', () => {
    expect(formatClosureDay('2026-10-26')).toBe('lunes, 26 de octubre')
  })

  it.each([
    ['', null],
    ['0', null],
    ['12', null],
    ['-1', 'Escribe un número entero de 0 en adelante, sin puntos ni comas.'],
    ['1.5', 'Escribe un número entero de 0 en adelante, sin puntos ni comas.'],
    ['diez', 'Escribe un número entero de 0 en adelante, sin puntos ni comas.'],
  ])('validates the count %s', (value, error) => {
    expect(countError(value)).toBe(error)
  })

  it('labels the differences with their sign', () => {
    expect(differenceLabel(-2, 'und')).toBe('−2 und')
    expect(differenceLabel(5, 'g')).toBe('+5 g')
    expect(differenceLabel(0, 'und')).toBe('Sin diferencia')
    expect(differenceLabel(null, 'und')).toBe('—')
  })

  it('explains a locked closure', () => {
    expect(
      resolveClosureError(new ApiError('Locked', 422, {}, 'CLOSURE_LOCKED'), 'fallback'),
    ).toContain('ya se confirmó o se bloqueó')
  })
})
