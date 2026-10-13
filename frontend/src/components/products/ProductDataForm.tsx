import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { productsService } from '../../services/products.service'
import type { Category } from '../../types/category'
import type { Product, UpdateProductPayload } from '../../types/product'
import type { UnitOfMeasure } from '../../types/unit'
import {
  productFieldError,
  productSchema,
  resolveProductError,
  toPriceInput,
  toPriceString,
  type ProductFormValues,
} from '../../utils/products'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { ProductFields } from './ProductFields'

import './ProductForm.css'

type Feedback = { tone: 'success' | 'error'; text: string } | null

interface ProductDataFormProps {
  product: Product
  canEdit: boolean
  onSaved: () => void
}

function toValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    referenceCode: product.referenceCode,
    description: product.description ?? '',
    categoryId: product.category.id,
    unitOfMeasureId: product.unitOfMeasure.id,
    price: toPriceInput(product.price),
  }
}

function withCurrent<T extends { id: string }>(options: T[], current: T): T[] {
  return options.some((option) => option.id === current.id) ? options : [current, ...options]
}

export function ProductDataForm({ product, canEdit, onSaved }: ProductDataFormProps) {
  const { token } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const options = useCatalogOptions({ activeOnly: true })
  const current = toValues(product)

  const categories = useMemo<Category[]>(
    () =>
      withCurrent(options.categories, {
        id: product.category.id,
        name: product.category.name,
        description: null,
        active: false,
      }),
    [options.categories, product.category],
  )
  const units = useMemo<UnitOfMeasure[]>(
    () =>
      withCurrent(options.units, {
        ...product.unitOfMeasure,
        active: false,
      }),
    [options.units, product.unitOfMeasure],
  )

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    values: current,
  })
  const [categoryId, unitOfMeasureId, price, description] = useWatch({
    control,
    name: ['categoryId', 'unitOfMeasureId', 'price', 'description'],
  })

  const startEditing = () => {
    setFeedback(null)
    setIsEditing(true)
    setTimeout(() => setFocus('name'), 0)
  }

  const cancelEditing = () => {
    reset(current)
    setIsEditing(false)
    setFeedback(null)
  }

  const onSubmit = async (values: ProductFormValues) => {
    if (!isEditing) return
    setFeedback(null)
    const payload: UpdateProductPayload = {}
    if (values.name !== current.name) payload.name = values.name
    if (values.description !== current.description) payload.description = values.description
    if (values.categoryId !== current.categoryId) payload.categoryId = values.categoryId
    if (values.unitOfMeasureId !== current.unitOfMeasureId) {
      payload.unitOfMeasureId = values.unitOfMeasureId
    }
    const nextPrice = toPriceString(values.price)
    if (nextPrice !== toPriceString(current.price)) payload.price = nextPrice

    if (Object.keys(payload).length === 0) {
      setFeedback({ tone: 'error', text: 'No hay cambios por guardar.' })
      return
    }

    try {
      await productsService.update(product.id, payload, token)
      setIsEditing(false)
      setFeedback({ tone: 'success', text: 'Producto actualizado exitosamente.' })
      onSaved()
    } catch (error) {
      const fieldError = productFieldError(error)
      if (fieldError) {
        setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true })
        options.reload()
        return
      }
      setFeedback({
        tone: 'error',
        text: resolveProductError(error, 'No fue posible guardar los cambios. Intenta de nuevo.'),
      })
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <ProductFields
        idPrefix="product"
        register={register}
        errors={errors}
        values={{ categoryId, unitOfMeasureId, price, description }}
        categories={categories}
        units={units}
        optionsLoading={options.status === 'loading'}
        referenceCodeLocked
        readOnlyProduct={isEditing ? undefined : product}
      />

      {isEditing && (
        <p className="product-form__note">
          Solo se pueden elegir categorías y unidades activas. Si la actual está inactiva, el
          producto la conserva mientras no la cambies.
        </p>
      )}

      {canEdit && (
        <div className="product-form__actions">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={cancelEditing} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startEditing}>
              Editar producto
            </Button>
          )}
        </div>
      )}
    </form>
  )
}
