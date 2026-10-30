import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { AuditLog } from '../../types/auditLog'
import { formatDateTime } from '../../utils/format'

import { AuditLogsTable } from './AuditLogsTable'

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
    userAccount: {
      person: {
        id: 'person-9',
        firstName: 'Admin',
        lastName: 'Sistema',
        email: 'admin@intelligent.co',
      },
    },
    ...overrides,
  }
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement

describe('AuditLogsTable', () => {
  it('renders the executor, action and reason of each log', () => {
    const log = makeLog()
    render(<AuditLogsTable logs={[log]} showDetails />)

    const row = within(rowOf('Admin Sistema'))
    expect(row.getByText('admin@intelligent.co')).toBeInTheDocument()
    expect(row.getByText('Actualización')).toBeInTheDocument()
    expect(row.getByText('Usuario')).toBeInTheDocument()
    expect(row.getByText('Cambio de nombre registrado')).toBeInTheDocument()
    expect(row.getByText(formatDateTime(log.createdAt))).toBeInTheDocument()
  })

  it('falls back when the log has no reason', () => {
    render(<AuditLogsTable logs={[makeLog({ reason: '' })]} showDetails />)

    expect(within(rowOf('Admin Sistema')).getByText('—')).toBeInTheDocument()
  })

  it('hides the entity and the detail toggle without permission', () => {
    render(<AuditLogsTable logs={[makeLog()]} showDetails={false} />)

    expect(screen.queryByRole('columnheader', { name: 'Entidad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver cambios' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ejecutado por' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Acción' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Fecha' })).toBeInTheDocument()
  })

  it('expands one record at a time', async () => {
    const user = userEvent.setup()
    render(
      <AuditLogsTable
        logs={[makeLog(), makeLog({ id: 'log-2', entityId: 'user-2' })]}
        showDetails
      />,
    )
    const [first, second] = screen.getAllByRole('button', { name: 'Ver cambios' })

    await user.click(first)

    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText('Antes')).toHaveLength(1)
    expect(screen.getByText('user-1')).toBeInTheDocument()

    await user.click(second)

    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByText('Antes')).toHaveLength(1)
    expect(screen.getByText('user-2')).toBeInTheDocument()
    expect(screen.queryByText('user-1')).not.toBeInTheDocument()
  })

  it('closes the detail with the same control', async () => {
    const user = userEvent.setup()
    render(<AuditLogsTable logs={[makeLog()]} showDetails />)

    await user.click(screen.getByRole('button', { name: 'Ver cambios' }))
    const close = screen.getByRole('button', { name: 'Ocultar' })
    expect(close).toHaveAttribute('aria-expanded', 'true')

    await user.click(close)

    expect(screen.getByRole('button', { name: 'Ver cambios' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByText('Antes')).not.toBeInTheDocument()
  })
})
