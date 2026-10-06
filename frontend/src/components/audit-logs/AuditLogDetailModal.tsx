import { Modal } from '../ui/Modal'

import './AuditLogDetailModal.css'

import type { AuditLog } from '../../types/auditLog'

interface AuditLogDetailModalProps {
  log: AuditLog | null
  onClose: () => void
}

function formatJson(data: Record<string, unknown> | null): string {
  if (!data) return 'Sin datos'
  return JSON.stringify(data, null, 2)
}

export function AuditLogDetailModal({ log, onClose }: AuditLogDetailModalProps) {
  return (
    <Modal open={log !== null} title="Detalle del cambio" onClose={onClose}>
      {log && (
        <div className="audit-detail">
          <div className="audit-detail__meta">
            <div>
              <span className="audit-detail__meta-label">Motivo</span>
              <p>{log.reason || 'Sin motivo registrado'}</p>
            </div>
          </div>
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
      )}
    </Modal>
  )
}
