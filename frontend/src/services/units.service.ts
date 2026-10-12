import type {
  CreateUnitPayload,
  UnitOfMeasure,
  UnitsListParams,
  UnitsListResponse,
} from '../types/unit'
import type { PaginationMeta } from '../types/user'

import { http } from './http'

const UNITS_PATH = '/unit-measure'

interface ApiUnit {
  id: string
  name: string
  abreviation: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

function toUnit({ abreviation, ...unit }: ApiUnit): UnitOfMeasure {
  return { ...unit, abbreviation: abreviation }
}

function buildUnitsQuery({ page, limit, search, active }: UnitsListParams): string {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (search) params.set('search', search)
  if (active !== undefined) params.set('active', String(active))
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const unitsService = {
  list: async (params: UnitsListParams, token: string | null): Promise<UnitsListResponse> => {
    const response = await http.get<{ data: ApiUnit[]; meta: PaginationMeta }>(
      `${UNITS_PATH}${buildUnitsQuery(params)}`,
      { token },
    )
    return { data: response.data.map(toUnit), meta: response.meta }
  },

  create: async (payload: CreateUnitPayload, token: string | null): Promise<UnitOfMeasure> => {
    const unit = await http.post<ApiUnit>(
      UNITS_PATH,
      { name: payload.name, abreviation: payload.abbreviation },
      { token },
    )
    return toUnit(unit)
  },
}
