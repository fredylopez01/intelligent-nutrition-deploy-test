import { useCallback, useEffect, useState } from 'react'

import { documentTypesService } from '../services/document-types.service'
import type { DocumentType } from '../types/supplier'

import { useAuth } from './useAuth'

type RequestStatus = 'loading' | 'success' | 'error'

export function useDocumentTypes() {
  const { token } = useAuth()
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([])
  const [status, setStatus] = useState<RequestStatus>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    documentTypesService
      .list(token)
      .then((data) => {
        if (!cancelled) {
          setDocumentTypes(data)
          setStatus('success')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [token, reloadToken])

  return {
    documentTypes,
    isLoading: status === 'loading',
    error: status === 'error',
    refetch: useCallback(() => setReloadToken((v) => v + 1), []),
  }
}
