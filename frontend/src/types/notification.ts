import type { PaginationMeta } from './user'

export type NotificationType = 'LOW_STOCK' | 'CLOSURE_NOT_CONFIRMED' | 'PURCHASE_PENDING_RECEIPT'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  message: string
  branchId: string | null
  productId: string | null
  read: boolean
  createdAt: string
}

export interface NotificationsListParams {
  page?: number
  limit?: number
  read?: boolean
  type?: NotificationType
}

export interface NotificationsListResponse {
  data: AppNotification[]
  meta: PaginationMeta
}
