import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import { businessToday, formatClosureDay, resolveClosureError } from './inventoryClosures'

describe('inventory closure helpers', () => {
  it('uses the Bogota calendar day', () => {
    expect(businessToday(new Date('2026-10-27T03:00:00.000Z'))).toBe('2026-10-26')
    expect(businessToday(new Date('2026-10-27T05:00:00.000Z'))).toBe('2026-10-27')
  })

  it('formats the closure day with its weekday', () => {
    expect(formatClosureDay('2026-10-26')).toBe('lunes, 26 de octubre')
  })

  it('explains that the branch already started the closure of today', () => {
    expect(
      resolveClosureError(new ApiError('Exists', 409, {}, 'CLOSURE_ALREADY_EXISTS'), 'fallback'),
    ).toContain('ya tiene un cierre para hoy')
  })
})
