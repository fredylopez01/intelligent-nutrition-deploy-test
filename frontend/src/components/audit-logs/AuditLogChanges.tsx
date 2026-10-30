import type { AuditLog } from '../../types/auditLog'

import './AuditLogChanges.css'

interface AuditLogChangesProps {
  log: AuditLog
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return 'Sin datos'
  return JSON.stringify(data, null, 2)
}

export function AuditLogChanges({ log }: AuditLogChangesProps) {
  return (
    <div className="audit-detail">
      <dl className="audit-detail__meta">
        <div>
          <dt>Motivo</dt>
          <dd>{log.reason || 'Sin motivo registrado'}</dd>
        </div>
        <div>
          <dt>Id del registro</dt>
          <dd className="audit-detail__mono">{log.entityId}</dd>
        </div>
        <div>
          <dt>IP</dt>
          <dd className="audit-detail__mono">{log.ipAddress ?? 'No registrada'}</dd>
        </div>
      </dl>
      <div className="audit-detail__diff">
        <div className="audit-detail__diff-col">
          <span className="audit-detail__diff-label">Antes</span>
          <pre className="audit-detail__json">{formatJson(log.oldData)}</pre>
        </div>
        <div className="audit-detail__diff-col">
          <span className="audit-detail__diff-label">Después</span>
          <pre className="audit-detail__json">{formatJson(log.newData)}</pre>
        </div>
      </div>
    </div>
  )
}
