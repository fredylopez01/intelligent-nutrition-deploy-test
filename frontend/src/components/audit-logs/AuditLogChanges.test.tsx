import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AuditLog } from '../../types/auditLog'

import { AuditLogChanges } from './AuditLogChanges'

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    userId: 'user-1',
    action: 'UPDATE',
    entity: 'USER',
    entityId: 'user-1',
    oldData: { firstName: 'Ana' },
    newData: { firstName: 'María' },
    reason: 'Cambio de nombre registrado',
    ipAddress: '127.0.0.1',
    createdAt: '2026-09-15T08:30:00.000Z',
    userAccount: null,
    ...overrides,
  }
}

describe('AuditLogChanges', () => {
  it('shows the reason, the record id and the ip', () => {
    render(<AuditLogChanges log={makeLog()} />)

    expect(screen.getByText('Motivo')).toBeInTheDocument()
    expect(screen.getByText('Cambio de nombre registrado')).toBeInTheDocument()
    expect(screen.getByText('Id del registro')).toBeInTheDocument()
    expect(screen.getByText('user-1')).toBeInTheDocument()
    expect(screen.getByText('IP')).toBeInTheDocument()
    expect(screen.getByText('127.0.0.1')).toBeInTheDocument()
  })

  it('falls back when the metadata is missing', () => {
    render(<AuditLogChanges log={makeLog({ reason: '', ipAddress: null })} />)

    expect(screen.getByText('Sin motivo registrado')).toBeInTheDocument()
    expect(screen.getByText('No registrada')).toBeInTheDocument()
  })

  it('prints both snapshots and marks empty ones', () => {
    render(<AuditLogChanges log={makeLog({ oldData: null })} />)

    expect(screen.getByText('Antes')).toBeInTheDocument()
    expect(screen.getByText('Después')).toBeInTheDocument()
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.getByText(/"firstName": "María"/)).toBeInTheDocument()
  })
})
