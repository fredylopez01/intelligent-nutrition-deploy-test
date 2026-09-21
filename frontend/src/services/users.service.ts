import type {
  CreateUserPayload,
  UpdateUserPayload,
  UpdateUserRolePayload,
  User,
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

function buildUsersQuery({ page, limit, active }: UsersListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}
async function listMock(params: UsersListParams): Promise<UsersListResponse> {
  await delay()
  const page = params.page ?? 1
  const limit = params.limit ?? 10
  const filtered =
    params.active === undefined ? MOCK_USERS : MOCK_USERS.filter((u) => u.active === params.active)
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

export const usersService = {
  list: (params: UsersListParams, token: string | null): Promise<UsersListResponse> => {
    if (USE_MOCKS) return listMock(params)
    return http.get<UsersListResponse>(`/users${buildUsersQuery(params)}`, { token })
  },

  create: async (payload: CreateUserPayload, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      return {
        id: `mock-${Date.now()}`,
        fullName: payload.fullName,
        email: payload.email,
        active: true,
        mustChangePassword: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        role: { id: payload.roleId, name: 'Rol simulado' },
      }
    }

    return http.post<User>('/users', payload, { token })
  },

  update: async (id: string, payload: UpdateUserPayload, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      const current = MOCK_USERS.find((u) => u.id === id)
      if (!current) throw new Error('User not found')
      return { ...current, ...payload, updatedAt: new Date().toISOString() }
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
      const current = MOCK_USERS.find((u) => u.id === id)
      if (!current) throw new Error('User not found')
      return { ...current, role: { id: payload.roleId, name: 'Rol simulado' } }
    }

    return http.patch<User>(`/users/role/${id}`, payload, { token })
  },

  resendActivation: async (email: string, token: string | null): Promise<{ message: string }> => {
    if (USE_MOCKS) {
      await delay()
      return { message: 'Activation email sent successfully' }
    }

    return http.post<{ message: string }>('/auth/activation/resend', { email }, { token })
  },
}
