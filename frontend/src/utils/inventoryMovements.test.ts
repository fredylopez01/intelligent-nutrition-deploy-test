import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'

import { buildMovement } from '../test-utils/inventoryMovements'

import {
  formatMovementDate,
  movementDirection,
  movementKind,
  movementPlace,
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

describe('api errors', () => {
  it('uses the fallback for unknown errors', () => {
    expect(resolveMovementError(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
