import type {
  CreateUserPayload,
  UpdateUserPayload,
  UpdateUserRolePayload,
  UpdateUserStatusPayload,
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

interface ApiUserPerson {
  id: string
  firstName: string | null
  lastName: string | null
  email: string | null
}

interface ApiUser {
  id: string
  personId?: string
  person?: ApiUserPerson
  fullName?: string
  email?: string
  active: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  role: { id: string; name: string }
  branches?: { id: string; name: string }[]
}

function normalizeUser(apiUser: ApiUser): User {
  const fullName =
    apiUser.fullName ??
    [apiUser.person?.firstName, apiUser.person?.lastName].filter(Boolean).join(' ')
  return {
    id: apiUser.id,
    fullName,
    email: apiUser.email ?? apiUser.person?.email ?? '',
    active: apiUser.active,
    mustChangePassword: apiUser.mustChangePassword,
    lastLoginAt: apiUser.lastLoginAt,
    createdAt: apiUser.createdAt,
    updatedAt: apiUser.updatedAt,
    role: apiUser.role,
  }
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? ''
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName
  return { firstName, lastName }
}

export const usersService = {
  list: async (params: UsersListParams, token: string | null): Promise<UsersListResponse> => {
    if (USE_MOCKS) return listMock(params)
    const response = await http.get<UsersListResponse>(`/users${buildUsersQuery(params)}`, {
      token,
    })
    return { ...response, data: response.data.map(normalizeUser) }
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

    const created = await http.post<ApiUser>(
      '/users',
      {
        person: {
          ...splitFullName(payload.fullName),
          email: payload.email,
        },
        roleId: payload.roleId,
      },
      { token },
    )
    return normalizeUser(created)
  },

  update: async (id: string, payload: UpdateUserPayload, token: string | null): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      const current = MOCK_USERS.find((u) => u.id === id)
      if (!current) throw new Error('User not found')
      return { ...current, ...payload, updatedAt: new Date().toISOString() }
    }

    const personPayload: Record<string, string> = {}
    if (payload.fullName !== undefined)
      Object.assign(personPayload, splitFullName(payload.fullName))
    if (payload.email !== undefined) personPayload.email = payload.email

    const updated = await http.patch<ApiUser>(
      `/users/${id}`,
      Object.keys(personPayload).length > 0 ? { person: personPayload } : {},
      { token },
    )
    return normalizeUser(updated)
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

    const updated = await http.patch<ApiUser>(`/users/role/${id}`, payload, { token })
    return normalizeUser(updated)
  },

  updateStatus: async (
    id: string,
    payload: UpdateUserStatusPayload,
    token: string | null,
  ): Promise<User> => {
    if (USE_MOCKS) {
      await delay()
      const current = MOCK_USERS.find((u) => u.id === id)
      if (!current) throw new Error('User not found')
      return { ...current, active: payload.active, updatedAt: new Date().toISOString() }
    }

    const updated = await http.patch<ApiUser>(`/users/${id}/status`, payload, { token })
    return normalizeUser(updated)
  },

  resendActivation: async (email: string, token: string | null): Promise<{ message: string }> => {
    if (USE_MOCKS) {
      await delay()
      return { message: 'Activation email sent successfully' }
    }

    return http.post<{ message: string }>('/auth/activation/resend', { email }, { token })
  },
}
