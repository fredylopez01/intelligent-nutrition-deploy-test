export interface Role {
  id: string
  name: string
  description?: string | null
  active?: boolean
}

export interface UserRoleRef {
  id: string
  name: string
}

export interface User {
  id: string
  fullName: string
  email: string
  active: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  role: UserRoleRef
}

export type UserStatus = 'activo' | 'pendiente' | 'inactivo'
export interface CreateUserPayload {
  fullName: string
  email: string
  roleId: string
}

export interface UpdateUserPayload {
  fullName?: string
  email?: string
}

export interface UpdateUserRolePayload {
  roleId: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface UsersListParams {
  page?: number
  limit?: number
  active?: boolean
}

export interface UsersListResponse {
  data: User[]
  meta: PaginationMeta
  message?: string
}
