import { useEffect, useState } from 'react'

import { inventoryService } from '../services/inventory.service'
import { productsService } from '../services/products.service'

import { useAuth } from './useAuth'

const PRODUCT_OPTIONS_LIMIT = 100

export interface MovementProductOption {
  id: string
  name: string
  referenceCode: string
}

interface OptionsResult {
  key: string
  products: MovementProductOption[]
}

export function useMovementProductOptions(branchId: string | null) {
  const { token } = useAuth()
  const [result, setResult] = useState<OptionsResult | null>(null)
  const requestKey = `${branchId ?? 'todas'}|${token ?? ''}`

  useEffect(() => {
    let cancelled = false
    const request = branchId
      ? inventoryService
          .listByBranch(branchId, { page: 1, limit: PRODUCT_OPTIONS_LIMIT }, token)
          .then((response) => response.data.map((item) => item.product))
      : productsService
          .list({ page: 1, limit: PRODUCT_OPTIONS_LIMIT }, token)
          .then((response) => response.data)
    request
      .then((products) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          products: products
            .map(({ id, name, referenceCode }) => ({ id, name, referenceCode }))
            .sort((a, b) => a.name.localeCompare(b.name, 'es')),
        })
      })
      .catch(() => {
        if (!cancelled) setResult({ key: requestKey, products: [] })
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, branchId, token])

  return result?.key === requestKey ? result.products : []
}
