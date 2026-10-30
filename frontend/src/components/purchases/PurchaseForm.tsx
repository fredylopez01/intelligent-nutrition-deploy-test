import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import type { SupplierOption } from '../../hooks/useSupplierOptions'
import { productsService } from '../../services/products.service'
import { purchasesService } from '../../services/purchases.service'
import type { Product } from '../../types/product'
import type { Purchase } from '../../types/purchase'
import { formatPrice, isValidPrice, toPriceString } from '../../utils/products'
import {
  PURCHASE_TEXT_MAX_LENGTH,
  purchaseSchema,
  resolvePurchaseError,
  type PurchaseFormValues,
} from '../../utils/purchases'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SearchBar } from '../ui/SearchBar'
import { SelectField } from '../ui/SelectField'
import { TextAreaField } from '../ui/TextAreaField'

import '../inventory-movements/MovementForms.css'
import './Purchases.css'

const RESULTS_LIMIT = 6

interface PurchaseFormProps {
  suppliers: SupplierOption[]
  onCreated: (purchase: Purchase) => void
  onCancel: () => void
}

interface SearchResult {
  key: string
  products: Product[]
  error: string | null
}

export function PurchaseForm({ suppliers, onCreated, onCancel }: PurchaseFormProps) {
  const { token } = useAuth()
  const [term, setTerm] = useState('')
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const searchKey = `${term}|${token ?? ''}`

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: { supplierId: '', observation: '', items: [] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = useWatch({ control, name: 'items' })
  const observation = useWatch({ control, name: 'observation' })

  useEffect(() => {
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
  }, [searchKey, term, token])

  const current = search?.key === searchKey ? search : null
  const addedIds = new Set(items.map((item) => item.productId))
  const total = items.reduce((sum, item) => {
    const quantity = /^\d+$/.test(item.requestedQuantity.trim())
      ? Number(item.requestedQuantity)
      : 0
    const price = isValidPrice(item.unitPrice) ? Number(toPriceString(item.unitPrice)) : 0
    return sum + quantity * price
  }, 0)

  const addProduct = (product: Product) => {
    if (addedIds.has(product.id)) return
    append({
      productId: product.id,
      productName: product.name,
      referenceCode: product.referenceCode,
      unit: product.unitOfMeasure.abbreviation,
      requestedQuantity: '',
      unitPrice: '',
    })
  }

  const onSubmit = async (values: PurchaseFormValues) => {
    setSubmitError(null)
    try {
      const purchase = await purchasesService.create(
        {
          supplierId: values.supplierId,
          ...(values.observation ? { observation: values.observation } : {}),
          items: values.items.map((item) => ({
            productId: item.productId,
            requestedQuantity: Number(item.requestedQuantity),
            unitPrice: toPriceString(item.unitPrice),
          })),
        },
        token,
      )
      onCreated(purchase)
    } catch (error) {
      setSubmitError(
        resolvePurchaseError(error, 'No fue posible registrar la compra. Intenta de nuevo.'),
      )
    }
  }

  return (
    <div className="movement-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <SelectField
        id="purchase-supplier"
        label="Proveedor"
        placeholder="Elige el proveedor"
        options={suppliers
          .filter((supplier) => supplier.active)
          .map((supplier) => ({ value: supplier.id, label: supplier.name }))}
        error={errors.supplierId?.message}
        {...register('supplierId')}
      />

      <section className="movement-form__step" aria-labelledby="purchase-products-title">
        <h3 id="purchase-products-title" className="movement-form__step-title">
          Productos de la orden
        </h3>
        <SearchBar
          id="purchase-product-search"
          label="Buscar producto activo por nombre o código"
          placeholder="Buscar producto para agregar"
          value={term}
          onSearch={setTerm}
        />
        {current?.error && <Alert tone="error">{current.error}</Alert>}
        {current && current.products.length > 0 && (
          <ul
            className="movement-form__results purchase-form__results"
            aria-label="Productos activos"
          >
            {current.products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  className="movement-form__result"
                  onClick={() => addProduct(product)}
                  disabled={addedIds.has(product.id) || isSubmitting}
                >
                  <span className="movement-form__product-name">
                    {product.name}
                    {addedIds.has(product.id) ? ' · ya está en la orden' : ''}
                  </span>
                  <span className="movement-form__product-meta">{product.referenceCode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {current && !current.error && current.products.length === 0 && (
          <p className="movement-form__hint" role="status">
            Ningún producto activo coincide con "{term}".
          </p>
        )}

        {fields.length === 0 ? (
          <p className="movement-form__hint">
            {errors.items?.message ?? 'Busca y agrega los productos que vas a pedir.'}
          </p>
        ) : (
          <ul className="purchase-form__lines" aria-label="Líneas de la orden">
            {fields.map((field, index) => {
              const line = items[index]
              const lineErrors = errors.items?.[index]
              const quantity = /^\d+$/.test(line?.requestedQuantity.trim() ?? '')
                ? Number(line.requestedQuantity)
                : 0
              const price =
                line && isValidPrice(line.unitPrice) ? Number(toPriceString(line.unitPrice)) : 0
              return (
                <li key={field.id} className="purchase-form__line">
                  <div className="purchase-form__product">
                    <span className="movement-form__product-name">{field.productName}</span>
                    <span className="movement-form__product-meta">
                      {field.referenceCode} · subtotal {formatPrice(quantity * price)}
                    </span>
                  </div>
                  <div className="purchase-form__field">
                    <label htmlFor={`purchase-quantity-${index}`}>Cantidad ({field.unit})</label>
                    <input
                      id={`purchase-quantity-${index}`}
                      className={`ui-field__control${lineErrors?.requestedQuantity ? ' ui-field__control--invalid' : ''}`}
                      inputMode="numeric"
                      autoComplete="off"
                      {...register(`items.${index}.requestedQuantity`)}
                    />
                    {lineErrors?.requestedQuantity && (
                      <span className="ui-field__error" role="alert">
                        {lineErrors.requestedQuantity.message}
                      </span>
                    )}
                  </div>
                  <div className="purchase-form__field">
                    <label htmlFor={`purchase-price-${index}`}>Costo unitario</label>
                    <input
                      id={`purchase-price-${index}`}
                      className={`ui-field__control${lineErrors?.unitPrice ? ' ui-field__control--invalid' : ''}`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="Ej. 98000"
                      {...register(`items.${index}.unitPrice`)}
                    />
                    {lineErrors?.unitPrice && (
                      <span className="ui-field__error" role="alert">
                        {lineErrors.unitPrice.message}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="purchase-form__remove"
                    aria-label={`Quitar ${field.productName} de la orden`}
                    onClick={() => remove(index)}
                    disabled={isSubmitting}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <TextAreaField
        id="purchase-observation"
        label="Observación (opcional)"
        rows={2}
        maxLength={PURCHASE_TEXT_MAX_LENGTH}
        length={observation.length}
        placeholder="Ej. Pedido mensual de proteínas"
        error={errors.observation?.message}
        {...register('observation')}
      />

      <p className="movement-form__summary">
        <span>
          Total de la orden: <strong>{formatPrice(total)}</strong>
        </span>
        <span>Registrar la orden no cambia el stock: entra al recibir la mercancía.</span>
      </p>

      <div className="movement-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={() => void handleSubmit(onSubmit)()} disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar orden de compra'}
        </Button>
      </div>
    </div>
  )
}
