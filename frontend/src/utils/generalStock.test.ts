import { describe, expect, it } from 'vitest'

import { ApiError } from '../services/http'

import { projectedGeneralStock, resolveRestockError, restockSchema } from './generalStock'

describe('general stock restock helpers', () => {
  it('projects the stock after an entry or an exit', () => {
    expect(projectedGeneralStock(12, 'ADJUSTMENT_ENTRY', '8')).toBe(20)
    expect(projectedGeneralStock(12, 'ADJUSTMENT_EXIT', '15')).toBe(-3)
    expect(projectedGeneralStock(12, 'ADJUSTMENT_ENTRY', '1.5')).toBeNull()
  })

  it('asks for a whole quantity and a reason of 10 characters', () => {
    const base = { movementType: 'ADJUSTMENT_ENTRY' as const, quantity: '5' }

    expect(restockSchema.safeParse({ ...base, reason: 'Conteo' }).success).toBe(false)
    expect(
      restockSchema.safeParse({ ...base, quantity: '0', reason: 'Conteo físico' }).success,
    ).toBe(false)
    expect(restockSchema.safeParse({ ...base, reason: 'Conteo físico' }).success).toBe(true)
  })

  it('explains an exit larger than the general stock', () => {
    expect(
      resolveRestockError(
        new ApiError('Short', 422, { available: 4 }, 'INSUFFICIENT_GENERAL_STOCK'),
        'fallback',
      ),
    ).toBe('El stock general solo tiene 4 unidades de este producto: no puede quedar negativo.')
  })
})
