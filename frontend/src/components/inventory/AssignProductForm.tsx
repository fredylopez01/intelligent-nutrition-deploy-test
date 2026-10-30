import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { generalStockService } from '../../services/generalStock.service'
import { ApiError } from '../../services/http'
import { inventoryService } from '../../services/inventory.service'
import { productsService } from '../../services/products.service'
import type { AssignedLot, BranchInventoryDetail, GeneralStockLot } from '../../types/inventory'
import type { Product } from '../../types/product'
import {
  assignFieldError,
  assignProductSchema,
  formatExpirationDate,
  formatQuantity,
  resolveInventoryError,
  toExpirationDateTime,
  type AssignProductValues,
} from '../../utils/inventory'
import { formatPrice } from '../../utils/products'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SearchBar } from '../ui/SearchBar'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './AssignProductForm.css'

interface AssignProductFormProps {
  branchId: string
  branchName: string
  onAssigned: (lot: AssignedLot) => void
  onCancel: () => void
}

const RESULTS_LIMIT = 8

type Existing =
  | { status: 'loading' }
  | { status: 'new' }
  | { status: 'assigned'; detail: BranchInventoryDetail }
  | { status: 'error'; message: string }

interface StockLots {
  productId: string
  status: 'loading' | 'success' | 'error'
  lots: GeneralStockLot[]
}

interface SearchResult {
  key: string
  products: Product[]
  error: string | null
}

export function AssignProductForm({
  branchId,
  branchName,
  onAssigned,
  onCancel,
}: AssignProductFormProps) {
  const { token } = useAuth()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [selected, setSelected] = useState<Product | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ productId: string; value: Existing } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [stock, setStock] = useState<StockLots | null>(null)
  const searchKey = `${term}|${token ?? ''}`

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssignProductValues>({
    resolver: zodResolver(assignProductSchema),
    defaultValues: { quantity: '', minimumStock: '0', expirationDate: '' },
  })

  useEffect(() => {
    let cancelled = false
    productsService
      .list({ page: 1, limit: RESULTS_LIMIT, search: term || undefined, active: true }, token)
      .then((response) => {
        if (!cancelled) setSearch({ key: searchKey, products: response.data, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setSearch({
          key: searchKey,
          products: [],
          error: 'No fue posible buscar productos. Intenta de nuevo.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [searchKey, term, token])

  const selectProduct = (product: Product) => {
    setSelected(product)
    setProductError(null)
    setSubmitError(null)
    setExisting({ productId: product.id, value: { status: 'loading' } })
    setStock({ productId: product.id, status: 'loading', lots: [] })
    setValue('expirationDate', '')
    generalStockService
      .getByProduct(product.id, token)
      .then((detail) => {
        const lots = detail.lots.filter((lot) => !lot.expired && lot.quantity > 0)
        setStock({ productId: product.id, status: 'success', lots })
        if (lots.length > 0) setValue('expirationDate', lots[0].expirationDate)
      })
      .catch(() => {
        setStock({ productId: product.id, status: 'error', lots: [] })
      })
    inventoryService
      .getProductInBranch(branchId, product.id, token)
      .then((detail) => {
        setExisting({ productId: product.id, value: { status: 'assigned', detail } })
        if (detail.minimumStock !== undefined) {
          setValue('minimumStock', String(detail.minimumStock))
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === 'PRODUCT_NOT_ASSIGNED') {
          setExisting({ productId: product.id, value: { status: 'new' } })
          setValue('minimumStock', '0')
          return
        }
        setExisting({
          productId: product.id,
          value: {
            status: 'error',
            message: resolveInventoryError(
              error,
              'No fue posible revisar si el producto ya está en la sede.',
            ),
          },
        })
      })
  }

  const current = existing && existing.productId === selected?.id ? existing.value : null
  const assignedDetail = current?.status === 'assigned' ? current.detail : null
  const searchCurrent = search?.key === searchKey ? search : null
  const stockCurrent = stock && stock.productId === selected?.id ? stock : null
  const abbreviation = selected?.unitOfMeasure.abbreviation ?? ''
  const lotOptions = (stockCurrent?.lots ?? []).map((lot) => {
    const inBranch = assignedDetail?.lots.some(
      (branchLot) => branchLot.expirationDate.slice(0, 10) === lot.expirationDate,
    )
    return {
      value: lot.expirationDate,
      label: `Vence ${formatExpirationDate(lot.expirationDate)} · ${formatQuantity(lot.quantity, abbreviation)} disponibles${inBranch ? ' · ya está en la sede' : ''}`,
    }
  })
  const noStock = stockCurrent?.status === 'success' && stockCurrent.lots.length === 0

  const onSubmit = async (values: AssignProductValues) => {
    if (!selected) {
      setProductError('Elige el producto que vas a asignar.')
      return
    }
    setSubmitError(null)
    const expirationDate = toExpirationDateTime(values.expirationDate)
    const stockLot = stockCurrent?.lots.find((lot) => lot.expirationDate === values.expirationDate)
    if (stockLot && Number(values.quantity) > stockLot.quantity) {
      setError(
        'quantity',
        {
          message: `Solo hay ${formatQuantity(stockLot.quantity, abbreviation)} de este lote en el stock general.`,
        },
        { shouldFocus: true },
      )
      return
    }
    if (
      assignedDetail?.lots.some((lot) => lot.expirationDate.slice(0, 10) === values.expirationDate)
    ) {
      setError(
        'expirationDate',
        {
          message:
            'Este producto ya tiene un lote con esa fecha de vencimiento en la sede. Para cambiar su cantidad usa un movimiento de inventario.',
        },
        { shouldFocus: true },
      )
      return
    }
    try {
      const lot = await inventoryService.assign(
        branchId,
        {
          productId: selected.id,
          quantity: Number(values.quantity),
          ...(assignedDetail ? {} : { minimumStock: Number(values.minimumStock) }),
          expirationDate,
        },
        token,
      )
      onAssigned(lot)
    } catch (error) {
      const fieldError = assignFieldError(error)
      if (fieldError?.field === 'product') {
        setProductError(fieldError.message)
        return
      }
      if (fieldError) {
        setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolveInventoryError(error, 'No fue posible asignar el producto. Intenta de nuevo.'),
      )
    }
  }

  return (
    <div className="assign-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <section className="assign-form__step" aria-labelledby="assign-product-title">
        <h3 id="assign-product-title" className="assign-form__step-title">
          1. Producto
        </h3>

        {selected ? (
          <div className="assign-form__selected">
            <div className="assign-form__selected-info">
              <span className="assign-form__product-name">{selected.name}</span>
              <span className="assign-form__product-meta">
                {selected.referenceCode} · {selected.category.name} · {formatPrice(selected.price)}{' '}
                por {selected.unitOfMeasure.abbreviation}
              </span>
            </div>
            <button
              type="button"
              className="assign-form__change"
              onClick={() => {
                setSelected(null)
                setProductError(null)
              }}
              disabled={isSubmitting}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <SearchBar
              id="assign-product-search"
              label="Buscar producto activo por nombre o código"
              placeholder="Buscar producto por nombre o código"
              value={term}
              onSearch={setTerm}
            />
            {!searchCurrent && (
              <p className="assign-form__hint" role="status">
                Buscando productos...
              </p>
            )}
            {searchCurrent?.error && <Alert tone="error">{searchCurrent.error}</Alert>}
            {searchCurrent && !searchCurrent.error && searchCurrent.products.length === 0 && (
              <p className="assign-form__hint" role="status">
                {term
                  ? `Ningún producto activo coincide con "${term}".`
                  : 'No hay productos activos en el catálogo.'}
              </p>
            )}
            {searchCurrent && searchCurrent.products.length > 0 && (
              <ul className="assign-form__results" aria-label="Productos activos">
                {searchCurrent.products.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="assign-form__result"
                      onClick={() => selectProduct(product)}
                    >
                      <span className="assign-form__product-name">{product.name}</span>
                      <span className="assign-form__product-meta">
                        {product.referenceCode} · {product.category.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {productError && (
          <p className="assign-form__error" role="alert">
            {productError}
          </p>
        )}
      </section>

      {selected && current?.status === 'loading' && (
        <p className="assign-form__hint" role="status">
          Revisando el inventario de la sede...
        </p>
      )}
      {current?.status === 'error' && <Alert tone="error">{current.message}</Alert>}
      {stockCurrent?.status === 'error' && (
        <Alert tone="error">
          No fue posible cargar los lotes del stock general. Cambia de producto e intenta de nuevo.
        </Alert>
      )}
      {noStock && (
        <Alert tone="info">
          {selected?.name} no tiene unidades vigentes en el stock general. Primero registra la
          recepción de una compra de este producto.
        </Alert>
      )}
      {assignedDetail && (
        <Alert tone="info">
          {selected?.name} ya está en {branchName} con{' '}
          {formatQuantity(assignedDetail.totalQuantity, selected?.unitOfMeasure.abbreviation)} en{' '}
          {assignedDetail.lots.length === 1 ? '1 lote' : `${assignedDetail.lots.length} lotes`}{' '}
          (vencimientos:{' '}
          {assignedDetail.lots.map((lot) => formatExpirationDate(lot.expirationDate)).join(', ')}).
          Vas a traer un lote con otra fecha de vencimiento; el stock mínimo se mantiene igual para
          todos los lotes.
        </Alert>
      )}

      <form
        className="assign-form__step"
        aria-labelledby="assign-lot-title"
        onSubmit={(event) => {
          if (!selected) setProductError('Elige el producto que vas a asignar.')
          void handleSubmit(onSubmit)(event)
        }}
        noValidate
      >
        <h3 id="assign-lot-title" className="assign-form__step-title">
          2. Lote
        </h3>
        <div className="assign-form__row">
          <TextField
            id="assign-quantity"
            label="Cantidad inicial"
            inputMode="numeric"
            autoComplete="off"
            hint={
              selected
                ? `En ${selected.unitOfMeasure.name.toLocaleLowerCase('es')} (${selected.unitOfMeasure.abbreviation}). Sale del stock general.`
                : 'Sale del stock general.'
            }
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <TextField
            id="assign-minimum-stock"
            label="Stock mínimo"
            inputMode="numeric"
            autoComplete="off"
            readOnly={assignedDetail !== null}
            hint={
              assignedDetail
                ? 'Se hereda de los lotes que ya están en la sede.'
                : 'Umbral para la alerta de inventario bajo.'
            }
            error={errors.minimumStock?.message}
            {...register('minimumStock')}
          />
        </div>
        <SelectField
          id="assign-expiration"
          label="Lote del stock general"
          placeholder={stockCurrent?.status === 'loading' ? 'Cargando lotes...' : 'Elige un lote'}
          options={lotOptions}
          disabled={!selected || stockCurrent?.status !== 'success' || noStock}
          hint="La cantidad sale del lote elegido. Se propone el que vence primero."
          error={errors.expirationDate?.message}
          {...register('expirationDate')}
        />

        <div className="assign-form__actions">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              noStock ||
              (selected !== null &&
                (current?.status === 'loading' || stockCurrent?.status === 'loading'))
            }
          >
            {isSubmitting ? 'Asignando...' : 'Asignar a la sede'}
          </Button>
        </div>
      </form>
    </div>
  )
}
