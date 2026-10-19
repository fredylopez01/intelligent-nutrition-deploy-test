import type { PersonsSearchResponse } from '../types/person'

import { http } from './http'

export const personsService = {
  search: (search: string, limit: number, token: string | null) => {
    const params = new URLSearchParams({ search, limit: String(limit), page: '1' })
    return http.get<PersonsSearchResponse>(`/persons?${params.toString()}`, { token })
  },
}
