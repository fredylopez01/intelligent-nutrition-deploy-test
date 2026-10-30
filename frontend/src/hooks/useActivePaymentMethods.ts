import { useEffect, useState } from 'react'

import { paymentMethodsService } from '../services/paymentMethods.service'
import type { PaymentMethod } from '../types/paymentMethod'

import { useAuth } from './useAuth'

const PAYMENT_METHODS_LIMIT = 100

interface ActivePaymentMethodsResult {
  key: string
  status: 'success' | 'error'
  paymentMethods: PaymentMethod[]
}

export function useActivePaymentMethods(enabled: boolean) {
  const { token } = useAuth()
  const [result, setResult] = useState<ActivePaymentMethodsResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    paymentMethodsService
      .list({ page: 1, limit: PAYMENT_METHODS_LIMIT, active: true }, token)
      .then((response) => {
        if (!cancelled) {
          setResult({ key: requestKey, status: 'success', paymentMethods: response.data })
        }
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, status: 'error', paymentMethods: [] })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, requestKey, token])

  const current = result?.key === requestKey ? result : null
  const status: 'loading' | 'success' | 'error' = current?.status ?? 'loading'
  return {
    status,
    paymentMethods: current?.paymentMethods ?? [],
    reload: () => setReloadToken((value) => value + 1),
  }
}
