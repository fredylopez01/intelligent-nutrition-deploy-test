export interface AuditActorPerson {
  id: string
  firstName: string
  lastName: string
  email: string
}

export interface AuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  reason: string
  ipAddress: string | null
  createdAt: string
  userAccount: { person: AuditActorPerson } | null
}

export interface AuditLogsPaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AuditLogsListParams {
  page?: number
  limit?: number
  userId?: string
  action?: string
  fromDate?: string
  toDate?: string
}

export interface AuditLogsListResponse {
  data: AuditLog[]
  meta: AuditLogsPaginationMeta
  message?: string
}
