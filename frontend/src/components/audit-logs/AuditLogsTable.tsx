import { Fragment, useState } from 'react'

import type { AuditLog } from '../../types/auditLog'
import { auditExecutor } from '../../utils/auditLogs'
import { formatDateTime, getActionLabel, getEntityLabel } from '../../utils/format'

import { AuditLogChanges } from './AuditLogChanges'

import './AuditLogsTable.css'

interface AuditLogsTableProps {
  logs: AuditLog[]
  showDetails: boolean
}

export function AuditLogsTable({ logs, showDetails }: AuditLogsTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <table className="audit-logs-table">
      <caption className="sr-only">Historial de auditoría</caption>
      <thead>
        <tr>
          <th scope="col">Ejecutado por</th>
          <th scope="col">Acción</th>
          {showDetails && <th scope="col">Entidad</th>}
          <th scope="col">Motivo</th>
          <th scope="col">Fecha</th>
          {showDetails && (
            <th scope="col" className="audit-logs-table__col-detail">
              <span className="sr-only">Detalle</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => {
          const isOpen = expanded === log.id
          const detailId = `audit-log-${log.id}`
          return (
            <Fragment key={log.id}>
              <tr
                className={`audit-logs-table__row${isOpen ? ' audit-logs-table__row--open' : ''}`}
              >
                <td>
                  <span className="audit-logs-table__executor-name">{auditExecutor(log)}</span>
                  {log.userAccount?.person.email && (
                    <span className="audit-logs-table__executor-email">
                      {log.userAccount.person.email}
                    </span>
                  )}
                </td>
                <td className="audit-logs-table__cell-muted">{getActionLabel(log.action)}</td>
                {showDetails && (
                  <td className="audit-logs-table__cell-muted">{getEntityLabel(log.entity)}</td>
                )}
                <td className="audit-logs-table__reason">{log.reason || '—'}</td>
                <td className="audit-logs-table__cell-muted">{formatDateTime(log.createdAt)}</td>
                {showDetails && (
                  <td className="audit-logs-table__col-detail">
                    <button
                      type="button"
                      className="audit-logs-table__toggle"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                    >
                      {isOpen ? 'Ocultar' : 'Ver cambios'}
                    </button>
                  </td>
                )}
              </tr>
              {showDetails && isOpen && (
                <tr id={detailId} className="audit-logs-table__detail-row">
                  <td colSpan={6}>
                    <AuditLogChanges log={log} />
                  </td>
                </tr>
              )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
