import { useState } from 'react'

import { AuditLogDetailModal } from '../../components/audit-logs/AuditLogDetailModal'
import { AuditLogsFilters } from '../../components/audit-logs/AuditLogsFilters'
import { AuditLogsTable } from '../../components/audit-logs/AuditLogsTable'
import { AuditLogsTableSkeleton } from '../../components/audit-logs/AuditLogsTableSkeleton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { useUsers } from '../../hooks/useUsers'
import { AppLayout } from '../../layouts/AppLayout'
import type { AuditLog } from '../../types/auditLog'

import './AuditLogsPage.css'

const PAGE_SIZE = 10
// Límite alto para poblar el selector de usuarios del filtro con el
// catálogo casi completo. Si el volumen de usuarios crece mucho, esto
// debería cambiar a un buscador con autocompletado en vez de un <select>.
const USERS_FOR_FILTER_LIMIT = 100

export function AuditLogsPage() {
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const { status, logs, meta, emptyMessage, error, refetch } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    userId: userId || undefined,
    action: action || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })

  // Reutiliza el listado de usuarios ya existente para poblar el filtro
  // "Usuario afectado". No pagina: trae un lote grande de una vez.
  const { users } = useUsers({ page: 1, limit: USERS_FOR_FILTER_LIMIT })

  const totalPages = meta?.totalPages ?? 0
  const hasFilters = userId !== '' || action !== '' || fromDate !== '' || toDate !== ''

  const handleFilterChange = (updater: () => void) => {
    updater()
    setPage(1)
  }

  const renderList = () => {
    if (status === 'loading') return <AuditLogsTableSkeleton rows={PAGE_SIZE} />

    if (status === 'error') {
      return (
        <div className="audit-logs-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (logs.length === 0) {
      return (
        <EmptyState
          title={
            hasFilters
              ? 'Ningún registro coincide con los filtros'
              : 'Todavía no hay registros de auditoría'
          }
          description={
            hasFilters
              ? 'Ajusta el usuario, la acción o el rango de fechas.'
              : (emptyMessage ?? 'Los cambios sobre usuarios y sedes quedarán registrados aquí.')
          }
        />
      )
    }

    return <AuditLogsTable logs={logs} onViewDetail={setSelectedLog} />
  }

  return (
    <AppLayout title="Auditoría">
      <AuditLogsFilters
        users={users}
        userId={userId}
        action={action}
        fromDate={fromDate}
        toDate={toDate}
        onUserIdChange={(value) => handleFilterChange(() => setUserId(value))}
        onActionChange={(value) => handleFilterChange(() => setAction(value))}
        onFromDateChange={(value) => handleFilterChange(() => setFromDate(value))}
        onToDateChange={(value) => handleFilterChange(() => setToDate(value))}
      />

      <div className="audit-logs-page__card">{renderList()}</div>

      {status === 'success' && totalPages > 1 && (
        <div className="audit-logs-page__footer">
          <nav className="audit-logs-page__pagination" aria-label="Paginación de auditoría">
            <Button variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Anterior
            </Button>
            <span className="audit-logs-page__page-info">
              Página {meta?.page ?? page} de {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </nav>
        </div>
      )}

      <AuditLogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </AppLayout>
  )
}
