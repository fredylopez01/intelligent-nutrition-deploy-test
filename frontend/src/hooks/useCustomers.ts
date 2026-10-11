import { useCallback, useEffect, useState } from 'react'

import { customersService } from '../services/customers.service'
import type { Customer, CustomersListParams } from '../types/customer'
import type { PaginationMeta } from '../types/user'
import { resolveCustomerError } from '../utils/customers'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface CustomersResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  customers: Customer[]
  meta: PaginationMeta | null
  error: string | null
}

export function useCustomers({ page, limit, search, active }: CustomersListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<CustomersResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = [
    page ?? 1,
    limit ?? 10,
    search ?? '',
    active ?? 'todos',
    token ?? '',
    reloadToken,
  ].join('|')

  useEffect(() => {
    let cancelled = false
    customersService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          customers: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          customers: [],
          meta: null,
          error: resolveCustomerError(err, 'No fue posible cargar los clientes. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, page, limit, search, active, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey

  return {
    status: isCurrent ? result.status : ('loading' as RequestStatus),
    customers: isCurrent ? result.customers : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
