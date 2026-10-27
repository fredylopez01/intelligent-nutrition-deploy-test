import { useState } from 'react'

import { AuditLogsFilters } from '../../components/audit-logs/AuditLogsFilters'
import { AuditLogsTable } from '../../components/audit-logs/AuditLogsTable'
import { AuditLogsTableSkeleton } from '../../components/audit-logs/AuditLogsTableSkeleton'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAuditLogs } from '../../hooks/useAuditLogs'
import { useAuth } from '../../hooks/useAuth'
import { useUsers } from '../../hooks/useUsers'
import { AppLayout } from '../../layouts/AppLayout'
import { auditLogsService } from '../../services/auditLogs.service'
import type { AuditLog } from '../../types/auditLog'
import { buildAuditCsv } from '../../utils/auditLogs'

import './AuditLogsPage.css'

const PAGE_SIZE = 10
// Límite alto para poblar el selector de usuarios del filtro con el
// catálogo casi completo. Si el volumen de usuarios crece mucho, esto
// debería cambiar a un buscador con autocompletado en vez de un <select>.
const USERS_FOR_FILTER_LIMIT = 100
const EXPORT_PAGE_SIZE = 100
const EXPORT_MAX_PAGES = 20

export function AuditLogsPage() {
  const { token } = useAuth()
  const [page, setPage] = useState(1)
  const [userId, setUserId] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const filters = {
    userId: userId || undefined,
    entity: entity || undefined,
    action: action || undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
  }
  const { status, logs, meta, emptyMessage, error, refetch } = useAuditLogs({
    page,
    limit: PAGE_SIZE,
    ...filters,
  })

  const { users } = useUsers({ page: 1, limit: USERS_FOR_FILTER_LIMIT })

  const totalPages = meta?.totalPages ?? 0
  const hasFilters =
    userId !== '' || entity !== '' || action !== '' || fromDate !== '' || toDate !== ''

  const exportCsv = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const rows: AuditLog[] = []
      for (let current = 1; current <= EXPORT_MAX_PAGES; current += 1) {
        const response = await auditLogsService.list(
          { page: current, limit: EXPORT_PAGE_SIZE, ...filters },
          token,
        )
        rows.push(...response.data)
        if (current >= response.meta.totalPages) break
      }
      const blob = new Blob([buildAuditCsv(rows)], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('No fue posible exportar el historial. Intenta de nuevo.')
    } finally {
      setExporting(false)
    }
  }

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
              ? 'Ajusta el usuario, la entidad, la acción o el rango de fechas.'
              : (emptyMessage ?? 'Los cambios sobre usuarios y sedes quedarán registrados aquí.')
          }
        />
      )
    }

    return <AuditLogsTable logs={logs} />
  }

  return (
    <AppLayout
      title="Auditoría"
      actions={
        <Button
          variant="outline"
          onClick={() => void exportCsv()}
          disabled={exporting || status !== 'success' || logs.length === 0}
        >
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </Button>
      }
    >
      {exportError && (
        <div className="audit-logs-page__feedback">
          <Alert tone="error">{exportError}</Alert>
        </div>
      )}

      <AuditLogsFilters
        users={users}
        userId={userId}
        entity={entity}
        action={action}
        fromDate={fromDate}
        toDate={toDate}
        onUserIdChange={(value) => handleFilterChange(() => setUserId(value))}
        onEntityChange={(value) => handleFilterChange(() => setEntity(value))}
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
    </AppLayout>
  )
}
