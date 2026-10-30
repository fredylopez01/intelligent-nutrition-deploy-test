import { useEffect, useState } from 'react'

import { suppliersService } from '../services/suppliers.service'

import { useAuth } from './useAuth'

const SUPPLIER_OPTIONS_LIMIT = 100

export interface SupplierOption {
  id: string
  name: string
  active: boolean
}

export function useSupplierOptions() {
  const { token } = useAuth()
  const [result, setResult] = useState<{
    key: string
    status: 'success' | 'error'
    suppliers: SupplierOption[]
  } | null>(null)
  const requestKey = token ?? ''

  useEffect(() => {
    let cancelled = false
    suppliersService
      .list({ page: 1, limit: SUPPLIER_OPTIONS_LIMIT }, token)
      .then((response) => {
        if (cancelled) return
        const suppliers = response.data
          .map((supplier) => ({
            id: supplier.id,
            name:
              supplier.commercialName ??
              supplier.person.businessName ??
              [supplier.person.firstName, supplier.person.lastName].filter(Boolean).join(' '),
            active: supplier.person.active,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        setResult({ key: requestKey, status: 'success', suppliers })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, status: 'error', suppliers: [] })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, token])

  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as const),
    suppliers: isCurrent ? result.suppliers : [],
  }
}
