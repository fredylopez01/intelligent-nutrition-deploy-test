import { useCallback, useEffect, useState } from 'react'

import { auditLogsService } from '../services/auditLogs.service'
import type { AuditLog, AuditLogsListParams, AuditLogsPaginationMeta } from '../types/auditLog'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface AuditLogsResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  logs: AuditLog[]
  meta: AuditLogsPaginationMeta | null
  emptyMessage: string | null
  error: string | null
}

export function useAuditLogs({ page, limit, userId, action, fromDate, toDate }: AuditLogsListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<AuditLogsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${page ?? 1}|${limit ?? 10}|${userId ?? ''}|${action ?? ''}|${fromDate ?? ''}|${toDate ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false
    auditLogsService
      .list({ page, limit, userId, action, fromDate, toDate }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          logs: response.data,
          meta: response.meta,
          emptyMessage: response.message ?? null,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          logs: [],
          meta: null,
          emptyMessage: null,
          error:
            err instanceof Error
              ? err.message
              : 'No fue posible cargar el historial de auditoría. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, userId, action, fromDate, toDate, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])
  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    logs: isCurrent ? result.logs : [],
    meta: isCurrent ? result.meta : null,
    emptyMessage: isCurrent ? result.emptyMessage : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
