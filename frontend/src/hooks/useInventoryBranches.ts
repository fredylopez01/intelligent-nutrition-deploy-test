import { useEffect, useState } from 'react'

import { branchesService } from '../services/branches.service'

import { useAuth } from './useAuth'

const BRANCH_OPTIONS_LIMIT = 100

export interface InventoryBranchOption {
  id: string
  name: string
  active: boolean
}

interface BranchesResult {
  key: string
  status: 'success' | 'error'
  branches: InventoryBranchOption[]
}

export function useInventoryBranches() {
  const { user, token } = useAuth()
  const isSuperadmin = user?.role.name === 'SUPERADMIN'
  const [result, setResult] = useState<BranchesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${token ?? ''}|${reloadToken}`

  useEffect(() => {
    if (!isSuperadmin) return
    let cancelled = false
    branchesService
      .list({ page: 1, limit: BRANCH_OPTIONS_LIMIT }, token)
      .then((response) => {
        if (cancelled) return
        const branches = [...response.data]
          .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
          .map(({ id, name, active }) => ({ id, name, active }))
        setResult({ key: requestKey, status: 'success', branches })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ key: requestKey, status: 'error', branches: [] })
      })
    return () => {
      cancelled = true
    }
  }, [isSuperadmin, requestKey, token])

  if (!isSuperadmin) {
    const branches = [...(user?.branches ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name, active: true }))
    return { status: 'success' as const, branches, reload: () => undefined }
  }

  const isCurrent = result?.key === requestKey
  return {
    status: isCurrent ? result.status : ('loading' as const),
    branches: isCurrent ? result.branches : [],
    reload: () => setReloadToken((value) => value + 1),
  }
}
