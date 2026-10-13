import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { productsService } from '../../services/products.service'
import type { Product } from '../../types/product'
import {
  productFieldError,
  productSchema,
  resolveProductError,
  toPriceString,
  type ProductFormValues,
} from '../../utils/products'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { ProductFields } from './ProductFields'

import './ProductForm.css'

interface CreateProductFormProps {
  onCreated: (product: Product) => void
  onCancel: () => void
}

const EMPTY_VALUES: ProductFormValues = {
  name: '',
  referenceCode: '',
  description: '',
  categoryId: '',
  unitOfMeasureId: '',
  price: '',
}

export function CreateProductForm({ onCreated, onCancel }: CreateProductFormProps) {
  const { token } = useAuth()
  const options = useCatalogOptions({ activeOnly: true })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: EMPTY_VALUES,
  })
  const [categoryId, unitOfMeasureId, price, description] = useWatch({
    control,
    name: ['categoryId', 'unitOfMeasureId', 'price', 'description'],
  })

  const missingOptions =
    options.status === 'success' && (options.categories.length === 0 || options.units.length === 0)

  const onSubmit = async (values: ProductFormValues) => {
    setSubmitError(null)
    try {
      const product = await productsService.create(
        {
          name: values.name,
          referenceCode: values.referenceCode,
          ...(values.description ? { description: values.description } : {}),
          categoryId: values.categoryId,
          unitOfMeasureId: values.unitOfMeasureId,
          price: toPriceString(values.price),
        },
        token,
      )
      onCreated(product)
    } catch (error) {
      const fieldError = productFieldError(error)
      if (fieldError) {
        setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true })
        if (fieldError.field !== 'referenceCode') options.reload()
        return
      }
      setSubmitError(
        resolveProductError(error, 'No fue posible registrar el producto. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}
      {options.status === 'error' && (
        <Alert tone="error">
          No fue posible cargar las categorías y unidades. Cierra el formulario e intenta de nuevo.
        </Alert>
      )}
      {missingOptions && (
        <Alert tone="info">
          Para registrar productos necesitas al menos una categoría y una unidad de medida activas.
          Créalas en Catálogo &gt; Categorías y Catálogo &gt; Unidades de medida.
        </Alert>
      )}

      <ProductFields
        idPrefix="create-product"
        register={register}
        errors={errors}
        values={{ categoryId, unitOfMeasureId, price, description }}
        categories={options.categories}
        units={options.units}
        optionsLoading={options.status === 'loading'}
      />

      <p className="product-form__note">
        Solo se muestran categorías y unidades activas. El producto queda activo al registrarlo y
        las imágenes se agregarán después, desde su detalle.
      </p>

      <div className="product-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || options.status !== 'success' || missingOptions}
        >
          {isSubmitting ? 'Registrando...' : 'Registrar producto'}
        </Button>
      </div>
    </form>
  )
}
