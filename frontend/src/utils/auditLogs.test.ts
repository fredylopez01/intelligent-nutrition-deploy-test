import { describe, expect, it } from 'vitest'

import type { AuditLog } from '../types/auditLog'

import { AUDIT_CSV_HEADERS, auditExecutor, buildAuditCsv } from './auditLogs'

const log: AuditLog = {
  id: '1',
  userId: 'user-1',
  action: 'RECEIVE',
  entity: 'PURCHASE',
  entityId: 'purchase-1',
  oldData: null,
  newData: { status: 'FULLY_RECEIVED' },
  reason: 'Recepción "completa", sin novedades',
  ipAddress: '10.0.0.1',
  createdAt: '2026-10-26T15:00:00.000Z',
  user: { id: 'user-1', fullName: 'Laura Pérez' },
  userAccount: null,
}

describe('audit helpers', () => {
  it('prefers the executor name from the api', () => {
    expect(auditExecutor(log)).toBe('Laura Pérez')
    expect(auditExecutor({ ...log, user: null })).toBe('Usuario eliminado')
  })

  it('builds a CSV with labels, escaped text and the JSON changes', () => {
    const csv = buildAuditCsv([log])
    const [header, row] = csv.slice(1).split('\n')

    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(header).toBe(AUDIT_CSV_HEADERS.join(','))
    expect(row).toContain('Laura Pérez,Recepción,Compra,purchase-1')
    expect(row).toContain('"Recepción ""completa"", sin novedades"')
    expect(row).toContain('"{""status"":""FULLY_RECEIVED""}"')
  })
})
