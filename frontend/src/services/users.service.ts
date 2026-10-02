import type {
  AssignUserBranchPayload,
  CreateUserPayload,
  UpdateUserPayload,
  UpdateUserRolePayload,
  UpdateUserStatusPayload,
  User,
  UserBranchAssignment,
  UsersListParams,
  UsersListResponse,
} from '../types/user'

import { http } from './http'
import { MOCK_USERS } from './mocks/users.mock'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'
const MOCK_DELAY_MS = 500

function delay(ms = MOCK_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildUsersQuery({
  page,
  limit,
  active,
  search,
  roleId,
  branchId,
}: UsersListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (active !== undefined) params.set('active', String(active))
  if (search) params.set('search', search)
  if (roleId) params.set('roleId', roleId)
  if (branchId) params.set('branchId', branchId)
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function listMock(params: UsersListParams): Promise<UsersListResponse> {
  await delay()
  const page = params.page ?? 1
  const limit = params.limit ?? 10
  const term = params.search?.trim().toLowerCase() ?? ''
  const filtered = MOCK_USERS.filter((user) => {
    const matchesActive = params.active === undefined || user.active === params.active
    const matchesRole = !params.roleId || user.role.id === params.roleId
    const matchesTerm =
      term === '' ||
      `${user.person.firstName ?? ''} ${user.person.lastName ?? ''}`.toLowerCase().includes(term) ||
      (user.person.email ?? '').toLowerCase().includes(term)
    return matchesActive && matchesRole && matchesTerm
  })
  const start = (page - 1) * limit
  return {
    data: filtered.slice(start, start + limit),
    meta: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
    },
  }
}

function mockUser(id: string): User {
  const found = MOCK_USERS.find((user) => user.id === id)
  if (!found) throw new Error('User not found')
  return found
}

export const usersService = {
  list: (params: UsersListParams, token: string | null): Promise<UsersListResponse> => {
    if (USE_MOCKS) return listMock(params)
    return http.get<UsersListResponse>(`/users${buildUsersQuery(params)}`, { token })
  },

  getById: async (id: string, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      return mockUser(id)
    }
    return http.get<User>(`/users/${id}`, { token })
  },

  create: async (payload: CreateUserPayload, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      return {
        id: `mock-${Date.now()}`,
        personId: `mock-person-${Date.now()}`,
        person: {
          id: `mock-person-${Date.now()}`,
          firstName: payload.person.firstName,
          lastName: payload.person.lastName,
          email: payload.person.email,
          phone: payload.person.phone ?? null,
          address: payload.person.address ?? null,
        },
        role: { id: payload.roleId, name: 'Rol simulado' },
        branches: [],
        active: true,
        mustChangePassword: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
    return http.post<User>('/users', payload, { token })
  },

  update: async (id: string, payload: UpdateUserPayload, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      const current = mockUser(id)
      return {
        ...current,
        person: { ...current.person, ...payload.person },
        updatedAt: new Date().toISOString(),
      }
    }
    return http.patch<User>(`/users/${id}`, payload, { token })
  },

  updateRole: async (
    id: string,
    payload: UpdateUserRolePayload,
    token: string | null,
  ): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      return { ...mockUser(id), role: { id: payload.roleId, name: 'Rol simulado' } }
    }
    return http.patch<User>(`/users/${id}/role`, payload, { token })
  },

  updateStatus: async (
    id: string,
    payload: UpdateUserStatusPayload,
    token: string | null,
  ): Promise<{ message: string }> => {
    if (USE_MOCKS) {
      await delay()
      return { message: 'User status updated successfully.' }
    }
    return http.patch<{ message: string }>(`/users/${id}/status`, payload, { token })
  },

  listBranches: async (id: string, token: string | null): Promise<UserBranchAssignment[]> => {
    if (USE_MOCKS) {
      await delay()
      return []
    }
    return http.get<UserBranchAssignment[]>(`/users/${id}/branches`, { token })
  },

  assignBranch: async (
    id: string,
    payload: AssignUserBranchPayload,
    token: string | null,
  ): Promise<void> => {
    if (USE_MOCKS) {
      await delay()
      return
    }
    await http.post(`/users/${id}/branches`, payload, { token })
  },

  deactivateBranch: async (id: string, branchId: string, token: string | null): Promise<void> => {
    if (USE_MOCKS) {
      await delay()
      return
    }
    await http.patch(`/users/${id}/branches/${branchId}`, { active: false }, { token })
  },

  resendInvitation: async (email: string, token: string | null): Promise<{ message: string }> => {
    if (USE_MOCKS) {
      await delay()
      return { message: 'Activation email sent successfully' }
    }
    return http.post<{ message: string }>('/auth/resend', { email }, { token })
  },
}
