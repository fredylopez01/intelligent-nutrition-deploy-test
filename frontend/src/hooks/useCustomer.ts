import { useCallback, useEffect, useState } from 'react'

import { customersService } from '../services/customers.service'
import { ApiError } from '../services/http'
import type { Customer } from '../types/customer'
import { resolveCustomerError } from '../utils/customers'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'not-found' | 'error'

interface CustomerResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  customer: Customer | null
  error: string | null
}

export function useCustomer(customerId: string | undefined) {
  const { token } = useAuth()
  const [result, setResult] = useState<CustomerResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${customerId ?? ''}|${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    customersService
      .getById(customerId, token)
      .then((customer) => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'success', customer, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400)
        setResult({
          key: requestKey,
          status: notFound ? 'not-found' : 'error',
          customer: null,
          error: resolveCustomerError(err, 'No fue posible cargar el cliente. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, customerId, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result !== null && result.key === requestKey
  const previousCustomer =
    result !== null && result.customer?.id === customerId ? result.customer : null
  const isRefreshing = !isCurrent && previousCustomer !== null

  let status: RequestStatus = 'loading'
  if (!customerId) status = 'not-found'
  else if (isCurrent && result) status = result.status
  else if (isRefreshing) status = 'success'

  return {
    status,
    customer: isCurrent && result ? result.customer : previousCustomer,
    error: isCurrent && result ? result.error : null,
    isRefreshing,
    refetch,
  }
}
