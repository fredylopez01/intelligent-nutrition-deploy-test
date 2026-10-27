import { describe, expect, it } from 'vitest'

import { timeAgo, unreadBadge } from './notifications'

describe('notification helpers', () => {
  const now = new Date('2026-10-26T15:00:00.000Z')

  it.each([
    ['2026-10-26T14:59:45.000Z', 'hace un momento'],
    ['2026-10-26T14:55:00.000Z', 'hace 5 minutos'],
    ['2026-10-26T12:00:00.000Z', 'hace 3 horas'],
    ['2026-10-25T15:00:00.000Z', 'ayer'],
    ['2026-10-22T15:00:00.000Z', 'hace 4 días'],
  ])('describes %s as %s', (date, label) => {
    expect(timeAgo(date, now)).toBe(label)
  })

  it('caps the badge at 99+', () => {
    expect(unreadBadge(7)).toBe('7')
    expect(unreadBadge(140)).toBe('99+')
  })
})
