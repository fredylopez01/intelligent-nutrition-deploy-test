import type { AuditLogsListParams, AuditLogsListResponse } from '../types/auditLog'

import { http } from './http'

function buildAuditLogsQuery({
  page,
  limit,
  userId,
  action,
  entity,
  from,
  to,
}: AuditLogsListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (userId) params.set('userId', userId)
  if (action) params.set('action', action)
  if (entity) params.set('entity', entity)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const auditLogsService = {
  list: (params: AuditLogsListParams, token: string | null): Promise<AuditLogsListResponse> =>
    http.get<AuditLogsListResponse>(`/audit-logs${buildAuditLogsQuery(params)}`, { token }),
}
