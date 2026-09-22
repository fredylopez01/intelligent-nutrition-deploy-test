import type { Role } from '../types/user'

import { http } from './http'
import { MOCK_ROLES } from './mocks/users.mock'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export const rolesService = {
  list: async (token: string | null): Promise<Role[]> => {
    if (USE_MOCKS) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return MOCK_ROLES
    }

    return http.get<Role[]>('/roles', { token })
  },
}
