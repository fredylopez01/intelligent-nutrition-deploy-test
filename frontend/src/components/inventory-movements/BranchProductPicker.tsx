import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { inventoryService } from '../../services/inventory.service'
import type { BranchInventoryItem } from '../../types/inventory'
import { formatQuantity, resolveInventoryError } from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { SearchBar } from '../ui/SearchBar'

import './MovementForms.css'

const RESULTS_LIMIT = 8

interface BranchProductPickerProps {
  id: string
  branchId: string
  branchName: string
  selected: BranchInventoryItem | null
  onSelect: (item: BranchInventoryItem | null) => void
  disabled?: boolean
  error?: string | null
}

interface SearchResult {
  key: string
  items: BranchInventoryItem[]
  error: string | null
}

export function BranchProductPicker({
  id,
  branchId,
  branchName,
  selected,
  onSelect,
  disabled,
  error,
}: BranchProductPickerProps) {
  const { token } = useAuth()
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const searchKey = `${branchId}|${term}|${token ?? ''}`

  useEffect(() => {
    if (selected) return
    let cancelled = false
    inventoryService
      .listByBranch(branchId, { page: 1, limit: RESULTS_LIMIT, search: term || undefined }, token)
      .then((response) => {
        if (!cancelled) setResult({ key: searchKey, items: response.data, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setResult({
          key: searchKey,
          items: [],
          error: resolveInventoryError(err, 'No fue posible buscar productos. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [searchKey, branchId, term, token, selected])

  if (selected) {
    return (
      <div className="movement-form__picker">
        <div className="movement-form__selected">
          <div className="movement-form__selected-info">
            <span className="movement-form__product-name">{selected.product.name}</span>
            <span className="movement-form__product-meta">
              {selected.product.referenceCode} ·{' '}
              {formatQuantity(selected.totalQuantity, selected.product.unitOfMeasure.abbreviation)}{' '}
              en {branchName}
            </span>
          </div>
          <button
            type="button"
            className="movement-form__change"
            onClick={() => onSelect(null)}
            disabled={disabled}
          >
            Cambiar
          </button>
        </div>
        {error && (
          <p className="movement-form__error" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  const current = result?.key === searchKey ? result : null

  return (
    <div className="movement-form__picker">
      <SearchBar
        id={id}
        label={`Buscar producto de ${branchName} por nombre o código`}
        placeholder="Buscar producto por nombre o código"
        value={term}
        onSearch={setTerm}
      />
      {!current && (
        <p className="movement-form__hint" role="status">
          Buscando productos de la sede...
        </p>
      )}
      {current?.error && <Alert tone="error">{current.error}</Alert>}
      {current && !current.error && current.items.length === 0 && (
        <p className="movement-form__hint" role="status">
          {term
            ? `Ningún producto de ${branchName} coincide con "${term}".`
            : `${branchName} todavía no tiene productos asignados.`}
        </p>
      )}
      {current && current.items.length > 0 && (
        <ul className="movement-form__results" aria-label={`Productos de ${branchName}`}>
          {current.items.map((item) => (
            <li key={item.product.id}>
              <button
                type="button"
                className="movement-form__result"
                onClick={() => onSelect(item)}
                disabled={disabled}
              >
                <span className="movement-form__product-name">{item.product.name}</span>
                <span className="movement-form__product-meta">
                  {item.product.referenceCode} ·{' '}
                  {formatQuantity(item.totalQuantity, item.product.unitOfMeasure.abbreviation)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="movement-form__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
