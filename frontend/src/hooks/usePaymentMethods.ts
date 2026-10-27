import { useCallback, useEffect, useState } from 'react'

import { paymentMethodsService } from '../services/paymentMethods.service'
import type { PaymentMethod, PaymentMethodsListParams } from '../types/paymentMethod'
import type { PaginationMeta } from '../types/user'
import { resolvePaymentMethodError } from '../utils/paymentMethods'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

interface PaymentMethodsResult {
  key: string
  status: Exclude<RequestStatus, 'loading'>
  paymentMethods: PaymentMethod[]
  meta: PaginationMeta | null
  error: string | null
}

export function usePaymentMethods({ page, limit, search, active }: PaymentMethodsListParams) {
  const { token } = useAuth()
  const [result, setResult] = useState<PaymentMethodsResult | null>(null)
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
    paymentMethodsService
      .list({ page, limit, search, active }, token)
      .then((response) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'success',
          paymentMethods: response.data,
          meta: response.meta,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          status: 'error',
          paymentMethods: [],
          meta: null,
          error: resolvePaymentMethodError(
            err,
            'No fue posible cargar los métodos de pago. Intenta de nuevo.',
          ),
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
    paymentMethods: isCurrent ? result.paymentMethods : [],
    meta: isCurrent ? result.meta : null,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
