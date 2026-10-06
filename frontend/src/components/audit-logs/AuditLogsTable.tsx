import { formatDateTime, getActionLabel, getEntityLabel } from '../../utils/format'
import { Button } from '../ui/Button'

import './AuditLogsTable.css'

import type { AuditLog } from '../../types/auditLog'

interface AuditLogsTableProps {
  logs: AuditLog[]
  onViewDetail: (log: AuditLog) => void
}

function getExecutorLabel(log: AuditLog): string {
  const person = log.userAccount?.person
  if (!person) return 'Usuario eliminado'
  return `${person.firstName} ${person.lastName}`.trim()
}

export function AuditLogsTable({ logs, onViewDetail }: AuditLogsTableProps) {
  return (
    <table className="audit-logs-table">
      <caption className="sr-only">Historial de auditoría</caption>
      <thead>
        <tr>
          <th scope="col">Ejecutado por</th>
          <th scope="col">Acción</th>
          <th scope="col">Entidad</th>
          <th scope="col">Motivo</th>
          <th scope="col">Fecha</th>
          <th scope="col" className="audit-logs-table__col-detail">
            <span className="sr-only">Detalle</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {logs.map((log) => (
          <tr key={log.id} className="audit-logs-table__row">
            <td>
              <span className="audit-logs-table__executor-name">{getExecutorLabel(log)}</span>
              {log.userAccount?.person.email && (
                <span className="audit-logs-table__executor-email">
                  {log.userAccount.person.email}
                </span>
              )}
            </td>
            <td className="audit-logs-table__cell-muted">{getActionLabel(log.action)}</td>
            <td className="audit-logs-table__cell-muted">{getEntityLabel(log.entity)}</td>
            <td className="audit-logs-table__reason">{log.reason || '—'}</td>
            <td className="audit-logs-table__cell-muted">{formatDateTime(log.createdAt)}</td>
            <td className="audit-logs-table__col-detail">
              <Button variant="outline" onClick={() => onViewDetail(log)}>
                Ver detalle
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
