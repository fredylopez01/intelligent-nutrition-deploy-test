import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuditLogsTableSkeleton } from './AuditLogsTableSkeleton'

describe('AuditLogsTableSkeleton', () => {
  it('announces the loading state', () => {
    const { container } = render(<AuditLogsTableSkeleton />)

    expect(container.firstChild).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Cargando historial de auditoría...')).toBeInTheDocument()
  })

  it('renders the requested number of placeholder rows', () => {
    const rows = (element: HTMLElement) =>
      element.querySelectorAll('.audit-logs-skeleton__row').length

    const { container: byDefault } = render(<AuditLogsTableSkeleton />)
    expect(rows(byDefault.firstChild as HTMLElement)).toBe(6)

    const { container: custom } = render(<AuditLogsTableSkeleton rows={3} />)
    expect(rows(custom.firstChild as HTMLElement)).toBe(3)
  })
})
