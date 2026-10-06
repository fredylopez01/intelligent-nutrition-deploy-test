import type { AuditLogsListParams, AuditLogsListResponse } from '../types/auditLog'

import { http } from './http'

function buildAuditLogsQuery({
  page,
  limit,
  userId,
  action,
  fromDate,
  toDate,
}: AuditLogsListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (userId) params.set('userId', userId)
  if (action) params.set('action', action)
  if (fromDate) params.set('fromDate', fromDate)
  if (toDate) params.set('toDate', toDate)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const auditLogsService = {
  list: (params: AuditLogsListParams, token: string | null): Promise<AuditLogsListResponse> =>
    http.get<AuditLogsListResponse>(`/audit-logs${buildAuditLogsQuery(params)}`, { token }),
}
