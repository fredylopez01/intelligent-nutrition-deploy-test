import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import { ApiError } from '../services/http'
import { buildMovement } from '../test-utils/inventoryMovements'

import {
  adjustmentSchema,
  fefoLot,
  formatMovementDate,
  movementDirection,
  movementFieldError,
  movementKind,
  movementPlace,
  movementSchema,
  resolveMovementError,
  signedQuantity,
} from './inventoryMovements'

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-26T15:00:00.000Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

const centro = { id: 'branch-centro', name: 'Centro' }
const norte = { id: 'branch-norte', name: 'Norte' }

describe('movementKind', () => {
  it.each([
    [{ movementType: 'EXIT' as const }, 'exit'],
    [{ movementType: 'EXIT' as const, saleId: 'sale-1' }, 'sale'],
    [{ movementType: 'ENTRY' as const }, 'entry'],
    [{ movementType: 'ENTRY' as const, saleId: 'sale-1' }, 'sale-reversal'],
    [{ movementType: 'ENTRY' as const, purchaseId: 'purchase-1', branch: null }, 'purchase'],
    [{ movementType: 'TRANSFER' as const, originBranch: centro, branch: norte }, 'transfer'],
    [{ movementType: 'TRANSFER' as const, originBranch: null }, 'assignment'],
    [{ movementType: 'ADJUSTMENT_ENTRY' as const }, 'adjustment-entry'],
    [{ movementType: 'ADJUSTMENT_EXIT' as const }, 'adjustment-exit'],
  ])('classifies %o as %s', (overrides, kind) => {
    expect(movementKind(buildMovement(overrides))).toBe(kind)
  })
})

describe('direction, sign and place', () => {
  const transfer = buildMovement({
    movementType: 'TRANSFER',
    quantity: 4,
    originBranch: centro,
    branch: norte,
  })

  it('reads a transfer as an exit from the origin and an entry to the destination', () => {
    expect(movementDirection(transfer, centro.id)).toBe('out')
    expect(movementDirection(transfer, norte.id)).toBe('in')
    expect(movementDirection(transfer)).toBe('between')
    expect(signedQuantity(transfer, centro.id)).toBe('−4 und')
    expect(signedQuantity(transfer, norte.id)).toBe('+4 und')
    expect(signedQuantity(transfer)).toBe('4 und')
    expect(movementPlace(transfer)).toBe('Centro → Norte')
  })

  it('signs exits and adjustments', () => {
    expect(signedQuantity(buildMovement({ movementType: 'EXIT', quantity: 3 }))).toBe('−3 und')
    expect(signedQuantity(buildMovement({ movementType: 'ADJUSTMENT_ENTRY', quantity: 1 }))).toBe(
      '+1 und',
    )
  })

  it('names the general stock for receipts and assignments', () => {
    expect(movementPlace(buildMovement({ movementType: 'ENTRY', branch: null }))).toBe(
      'Stock general',
    )
    expect(
      movementPlace(
        buildMovement({ movementType: 'TRANSFER', originBranch: null, branch: centro }),
      ),
    ).toBe('Stock general → Centro')
  })
})

describe('formatMovementDate', () => {
  it('shows the date and time in Bogota', () => {
    expect(formatMovementDate('2026-10-27T02:05:00.000Z')).toMatch(/^26 oct 2026, 9:05 p/)
  })

  it('falls back for an invalid date', () => {
    expect(formatMovementDate('nope')).toBe('—')
  })
})

describe('fefoLot', () => {
  it('proposes the earliest current lot with units', () => {
    expect(
      fefoLot([
        { expirationDate: '2027-06-30', quantity: 5 },
        { expirationDate: '2026-10-01', quantity: 9 },
        { expirationDate: '2026-12-31', quantity: 0 },
        { expirationDate: '2027-01-31', quantity: 2 },
      ]),
    ).toEqual({ expirationDate: '2027-01-31', quantity: 2 })
  })

  it('keeps a lot that expires today', () => {
    expect(fefoLot([{ expirationDate: '2026-10-26', quantity: 1 }])).toBeDefined()
  })
})

describe('schemas', () => {
  const exit = { movementType: 'EXIT' as const, quantity: '3', expirationDate: '2027-01-31' }

  it('asks for the reason of an exit but not of an entry', () => {
    expect(movementSchema.safeParse({ ...exit, observation: '' }).success).toBe(false)
    expect(
      movementSchema.safeParse({ ...exit, movementType: 'ENTRY', observation: '' }).success,
    ).toBe(true)
  })

  it.each(['0', '-1', '1.5', '1,5', 'abc'])('rejects the quantity %s', (quantity) => {
    expect(
      movementSchema.safeParse({ ...exit, quantity, observation: 'Empaque roto' }).success,
    ).toBe(false)
  })

  it('requires 10 characters of reason and the date of a new lot', () => {
    const base = {
      movementType: 'ADJUSTMENT_ENTRY' as const,
      quantity: '1',
      expirationDate: '2027-01-31',
      newLotDate: '',
    }
    expect(adjustmentSchema.safeParse({ ...base, reason: 'Conteo' }).success).toBe(false)
    expect(
      adjustmentSchema.safeParse({ ...base, expirationDate: 'nuevo', reason: 'Conteo físico' })
        .success,
    ).toBe(false)
    expect(adjustmentSchema.safeParse({ ...base, reason: 'Conteo físico' }).success).toBe(true)
  })
})

describe('api errors', () => {
  it('points the stock errors to the quantity with the available units', () => {
    expect(
      movementFieldError(
        new ApiError('Short', 422, { available: 4, requested: 9 }, 'INSUFFICIENT_STOCK'),
      ),
    ).toEqual({ field: 'quantity', message: 'El lote solo tiene 4 und en la sede.' })
    expect(
      movementFieldError(
        new ApiError('Short', 422, { available: 2 }, 'INSUFFICIENT_GENERAL_STOCK'),
        'g',
      ),
    ).toEqual({ field: 'quantity', message: 'El stock general solo tiene 2 g de este lote.' })
  })

  it('points a destination without the product to the destination field', () => {
    expect(
      movementFieldError(new ApiError('No', 404, {}, 'PRODUCT_NOT_ASSIGNED_IN_DESTINATION'))?.field,
    ).toBe('branchId')
  })

  it('explains a closed day', () => {
    expect(
      resolveMovementError(new ApiError('Closed', 422, {}, 'INVENTORY_CLOSED'), 'fallback'),
    ).toContain('ya se cerró hoy')
  })

  it('uses the fallback for unknown errors', () => {
    expect(resolveMovementError(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
