import { useCallback, useEffect, useState } from 'react'

import { documentTypesService } from '../services/document-types.service'
import type { DocumentType } from '../types/supplier'

import { useAuth } from './useAuth'

interface DocumentTypesResult {
  key: string
  documentTypes: DocumentType[]
  error: string | null
}

export function useDocumentTypes() {
  const { token } = useAuth()
  const [result, setResult] = useState<DocumentTypesResult | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestKey = `${token ?? ''}|${reloadToken}`

  useEffect(() => {
    let cancelled = false

    documentTypesService
      .list(token)
      .then((documentTypes) => {
        if (cancelled) return
        setResult({ key: requestKey, documentTypes, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: requestKey,
          documentTypes: [],
          error:
            err instanceof Error ? err.message : 'No fue posible cargar los tipos de documento.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [requestKey, token])

  const refetch = useCallback(() => {
    setReloadToken((value) => value + 1)
  }, [])

  const isCurrent = result?.key === requestKey

  return {
    documentTypes: isCurrent ? result.documentTypes : [],
    isLoading: !isCurrent,
    error: isCurrent ? result.error : null,
    refetch,
  }
}
