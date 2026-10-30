import { useEffect, useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { productsService } from '../../services/products.service'
import type { AvailabilityBranch, InventoryProduct } from '../../types/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SearchBar } from '../ui/SearchBar'

import { ProductAvailability } from './ProductAvailability'

import './AvailabilityLookup.css'

const RESULTS_LIMIT = 6

interface AvailabilityLookupProps {
  branchId: string
  transferOriginIds?: string[]
  onRequestTransfer?: (product: InventoryProduct, origin: AvailabilityBranch) => void
  onClose: () => void
}

interface SearchResult {
  key: string
  products: InventoryProduct[]
  error: string | null
}

export function AvailabilityLookup({
  branchId,
  transferOriginIds,
  onRequestTransfer,
  onClose,
}: AvailabilityLookupProps) {
  const { token } = useAuth()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [selected, setSelected] = useState<InventoryProduct | null>(null)
  const searchKey = `${term}|${token ?? ''}`

  useEffect(() => {
    if (selected) return
    let cancelled = false
    productsService
      .list({ page: 1, limit: RESULTS_LIMIT, search: term || undefined, active: true }, token)
      .then((response) => {
        if (!cancelled) setSearch({ key: searchKey, products: response.data, error: null })
      })
      .catch(() => {
        if (!cancelled) {
          setSearch({
            key: searchKey,
            products: [],
            error: 'No fue posible buscar productos. Intenta de nuevo.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [searchKey, term, token, selected])

  if (selected) {
    return (
      <div className="availability-lookup">
        <div className="availability-lookup__selected">
          <div className="availability-lookup__info">
            <span className="availability-lookup__name">{selected.name}</span>
            <span className="availability-lookup__meta">
              {selected.referenceCode} · {selected.category.name}
            </span>
          </div>
          <button
            type="button"
            className="availability-lookup__change"
            onClick={() => setSelected(null)}
          >
            Cambiar producto
          </button>
        </div>
        <ProductAvailability
          branchId={branchId}
          product={selected}
          transferOriginIds={transferOriginIds}
          onRequestTransfer={
            onRequestTransfer ? (origin) => onRequestTransfer(selected, origin) : undefined
          }
          onClose={onClose}
        />
      </div>
    )
  }

  const current = search?.key === searchKey ? search : null

  return (
    <div className="availability-lookup">
      <SearchBar
        id="availability-search"
        label="Buscar producto por nombre o código"
        placeholder="Buscar producto por nombre o código"
        value={term}
        onSearch={setTerm}
      />
      {!current && (
        <p className="availability-lookup__hint" role="status">
          Buscando productos...
        </p>
      )}
      {current?.error && <Alert tone="error">{current.error}</Alert>}
      {current && !current.error && current.products.length === 0 && (
        <div className="availability-lookup__empty" role="status">
          <p className="availability-lookup__empty-title">
            {term ? `Ningún producto activo coincide con "${term}"` : 'No hay productos activos'}
          </p>
          <p className="availability-lookup__hint">
            {term
              ? 'Revisa el nombre o prueba con el código de referencia.'
              : 'Cuando el catálogo tenga productos activos, podrás consultar sus existencias aquí.'}
          </p>
        </div>
      )}
      {current && current.products.length > 0 && (
        <>
          <p className="availability-lookup__hint">
            {term
              ? 'Elige el producto para ver sus existencias en cada sede.'
              : 'Escribe el nombre o el código, o elige uno de estos productos.'}
          </p>
          <ul className="availability-lookup__results" aria-label="Productos encontrados">
            {current.products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="availability-lookup__result"
                  onClick={() => setSelected(product)}
                >
                  <span className="availability-lookup__name">{product.name}</span>
                  <span className="availability-lookup__meta">
                    {product.referenceCode} · {product.category.name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="availability-lookup__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  )
}
