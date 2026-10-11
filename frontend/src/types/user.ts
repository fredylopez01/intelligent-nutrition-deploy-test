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

export interface UserBranchRef {
  id: string
  name: string
}

export interface UserPerson {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  address: string | null
}

export interface User {
  id: string
  personId: string
  person: UserPerson
  role: UserRoleRef
  branches: UserBranchRef[]
  active: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type UserStatus = 'activo' | 'pendiente' | 'inactivo'

export interface CreateUserPersonPayload {
  documentTypeId: string
  documentNumber: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
}

export type CreateUserPayload = ({ person: CreateUserPersonPayload } | { personId: string }) & {
  roleId: string
  branchIds?: string[]
}

export interface UpdateUserPersonPayload {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  address?: string
}

export interface UpdateUserPayload {
  person: UpdateUserPersonPayload
}

export interface UpdateUserRolePayload {
  roleId: string
}

export interface UpdateUserStatusPayload {
  active: boolean
}

export interface UserBranchAssignment {
  id: string
  name: string
  assignmentDate: string | null
  endDate: string | null
  active: boolean
}

export interface AssignUserBranchPayload {
  branchId: string
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
  search?: string
  roleId?: string
  branchId?: string
}

export interface UsersListResponse {
  data: User[]
  meta: PaginationMeta
  message?: string
}
