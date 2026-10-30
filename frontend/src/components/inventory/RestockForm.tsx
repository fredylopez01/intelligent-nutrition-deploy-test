import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { generalStockService } from '../../services/generalStock.service'
import { productsService } from '../../services/products.service'
import type { GeneralStockDetail, InventoryProduct } from '../../types/inventory'
import {
  RESTOCK_REASON_MAX_LENGTH,
  RESTOCK_REASON_MIN_LENGTH,
  projectedGeneralStock,
  resolveRestockError,
  restockSchema,
  type RestockValues,
} from '../../utils/generalStock'
import { formatQuantity } from '../../utils/inventory'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SearchBar } from '../ui/SearchBar'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

import './RestockForm.css'

const RESULTS_LIMIT = 6

interface RestockFormProps {
  onRestocked: (stock: GeneralStockDetail, values: RestockValues) => void
  onCancel: () => void
}

interface SearchResult {
  key: string
  products: InventoryProduct[]
  error: string | null
}

interface StockResult {
  productId: string
  stock: GeneralStockDetail | null
  error: string | null
}

export function RestockForm({ onRestocked, onCancel }: RestockFormProps) {
  const { token } = useAuth()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [product, setProduct] = useState<InventoryProduct | null>(null)
  const [stockResult, setStockResult] = useState<StockResult | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const searchKey = `${term}|${token ?? ''}`

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RestockValues>({
    resolver: zodResolver(restockSchema),
    defaultValues: { movementType: 'ADJUSTMENT_ENTRY', quantity: '', reason: '' },
  })
  const movementType = useWatch({ control, name: 'movementType' })
  const quantity = useWatch({ control, name: 'quantity' })
  const reason = useWatch({ control, name: 'reason' })
  const isEntry = movementType === 'ADJUSTMENT_ENTRY'

  useEffect(() => {
    if (product) return
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
  }, [searchKey, term, token, product])

  useEffect(() => {
    if (!product) return
    let cancelled = false
    generalStockService
      .getByProduct(product.id, token)
      .then((stock) => {
        if (!cancelled) setStockResult({ productId: product.id, stock, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStockResult({
          productId: product.id,
          stock: null,
          error: resolveRestockError(error, 'No fue posible consultar el stock general.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [product, token])

  const current = product && stockResult?.productId === product.id ? stockResult : null
  const currentTotal = current?.stock?.totalQuantity ?? 0
  const unit = product?.unitOfMeasure.abbreviation ?? 'und'
  const projected = projectedGeneralStock(currentTotal, movementType, quantity)
  const stockReady = current !== null && current.error === null

  const onSubmit = async (values: RestockValues) => {
    if (!product) {
      setProductError('Elige el producto que vas a ajustar.')
      return
    }
    const amount = Number(values.quantity)
    if (!isEntry && amount > currentTotal) {
      setError(
        'quantity',
        {
          message: `El stock general solo tiene ${formatQuantity(currentTotal, unit)}: no puede quedar negativo.`,
        },
        { shouldFocus: true },
      )
      return
    }
    setSubmitError(null)
    try {
      const stock = await generalStockService.restock(
        product.id,
        { quantity: amount, movementType: values.movementType, reason: values.reason },
        token,
      )
      onRestocked(stock, values)
    } catch (error) {
      setSubmitError(
        resolveRestockError(error, 'No fue posible ajustar el stock general. Intenta de nuevo.'),
      )
    }
  }

  const submit = () => {
    if (!product) setProductError('Elige el producto que vas a ajustar.')
    void handleSubmit(onSubmit)()
  }

  const results = search?.key === searchKey ? search : null

  return (
    <div className="restock-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <section className="restock-form__step" aria-labelledby="restock-product-title">
        <h3 id="restock-product-title" className="restock-form__step-title">
          1. Producto
        </h3>
        {product ? (
          <div className="restock-form__selected">
            <div className="restock-form__info">
              <span className="restock-form__name">{product.name}</span>
              <span className="restock-form__meta">
                {product.referenceCode} · {product.category.name}
              </span>
            </div>
            <button
              type="button"
              className="restock-form__change"
              onClick={() => setProduct(null)}
              disabled={isSubmitting}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <SearchBar
              id="restock-product-search"
              label="Buscar producto por nombre o código"
              placeholder="Buscar producto por nombre o código"
              value={term}
              onSearch={setTerm}
            />
            {!results && (
              <p className="restock-form__hint" role="status">
                Buscando productos...
              </p>
            )}
            {results?.error && <Alert tone="error">{results.error}</Alert>}
            {results && !results.error && results.products.length === 0 && (
              <p className="restock-form__hint" role="status">
                {term
                  ? `Ningún producto activo coincide con "${term}".`
                  : 'No hay productos activos.'}
              </p>
            )}
            {results && results.products.length > 0 && (
              <ul className="restock-form__results" aria-label="Productos encontrados">
                {results.products.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className="restock-form__result"
                      onClick={() => {
                        setProduct(option)
                        setProductError(null)
                        setSubmitError(null)
                      }}
                    >
                      <span className="restock-form__name">{option.name}</span>
                      <span className="restock-form__meta">
                        {option.referenceCode} · {option.category.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {productError && (
          <p className="ui-field__error" role="alert">
            {productError}
          </p>
        )}
      </section>

      <fieldset className="restock-form__step">
        <legend className="restock-form__step-title">2. Ajuste</legend>
        <div className="restock-form__choices" role="radiogroup" aria-label="Tipo de ajuste">
          <label className="restock-form__choice">
            <input type="radio" value="ADJUSTMENT_ENTRY" {...register('movementType')} />
            <span>
              Agregar unidades
              <small>Llegó mercancía o el conteo encontró más unidades.</small>
            </span>
          </label>
          <label className="restock-form__choice">
            <input type="radio" value="ADJUSTMENT_EXIT" {...register('movementType')} />
            <span>
              Retirar unidades
              <small>Producto dañado, vencido o faltante en el conteo.</small>
            </span>
          </label>
        </div>
        <TextField
          id="restock-quantity"
          label={isEntry ? 'Cantidad a agregar' : 'Cantidad a retirar'}
          inputMode="numeric"
          autoComplete="off"
          error={errors.quantity?.message}
          {...register('quantity')}
        />
        <TextAreaField
          id="restock-reason"
          label="Razón del ajuste"
          rows={3}
          maxLength={RESTOCK_REASON_MAX_LENGTH}
          length={reason.length}
          placeholder="Ej. Conteo físico del almacén central del 28 de octubre"
          hint={`Mínimo ${RESTOCK_REASON_MIN_LENGTH} caracteres. Queda en el movimiento y en la auditoría.`}
          error={errors.reason?.message}
          {...register('reason')}
        />
      </fieldset>

      <section className="restock-form__summary" aria-label="Resumen del stock general">
        {!product && (
          <p className="restock-form__hint">Elige un producto para ver su stock general.</p>
        )}
        {product && !current && (
          <p className="restock-form__hint" role="status">
            Consultando el stock general...
          </p>
        )}
        {current?.error && <Alert tone="error">{current.error}</Alert>}
        {stockReady && (
          <dl className="restock-form__figures">
            <div>
              <dt>Stock general actual</dt>
              <dd>{formatQuantity(currentTotal, unit)}</dd>
            </div>
            <div className={projected !== null && projected < 0 ? 'restock-form__negative' : ''}>
              <dt>Después del ajuste</dt>
              <dd>{projected === null ? '—' : formatQuantity(projected, unit)}</dd>
            </div>
          </dl>
        )}
        {stockReady && (
          <p className="restock-form__hint">
            {isEntry
              ? 'Las unidades se suman al lote vigente que vence primero. Si no hay lotes vigentes, quedan en un lote sin fecha de vencimiento.'
              : 'Las unidades salen de los lotes que vencen primero, incluidos los vencidos.'}
          </p>
        )}
      </section>

      <div className="restock-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={isSubmitting || (product !== null && !stockReady)}>
          {isSubmitting ? 'Ajustando...' : 'Confirmar ajuste'}
        </Button>
      </div>
    </div>
  )
}
