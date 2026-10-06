import './AuditLogsTableSkeleton.css'

interface AuditLogsTableSkeletonProps {
  rows?: number
}

export function AuditLogsTableSkeleton({ rows = 6 }: AuditLogsTableSkeletonProps) {
  return (
    <div className="audit-logs-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando historial de auditoría...</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="audit-logs-skeleton__row" key={index} aria-hidden="true">
          <span className="audit-logs-skeleton__line audit-logs-skeleton__line--name" />
          <span className="audit-logs-skeleton__line audit-logs-skeleton__line--cell" />
          <span className="audit-logs-skeleton__line audit-logs-skeleton__line--cell" />
          <span className="audit-logs-skeleton__line audit-logs-skeleton__line--cell" />
          <span className="audit-logs-skeleton__line audit-logs-skeleton__line--cell" />
        </div>
      ))}
    </div>
  )
}
