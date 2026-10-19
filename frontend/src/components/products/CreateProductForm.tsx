import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { useCatalogOptions } from '../../hooks/useCatalogOptions'
import { productImagesService } from '../../services/productImages.service'
import { productsService } from '../../services/products.service'
import type { Product } from '../../types/product'
import { MAX_PRODUCT_IMAGES, selectImageFiles, type RejectedImage } from '../../utils/productImages'
import {
  productFieldError,
  productSchema,
  resolveProductError,
  toPriceString,
  type ProductFormValues,
} from '../../utils/products'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { PendingImagesPicker, type PendingImage } from './PendingImagesPicker'
import { ProductFields } from './ProductFields'

import './ProductForm.css'

interface CreateProductFormProps {
  onCreated: (product: Product, failedImages: number) => void
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
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [primaryKey, setPrimaryKey] = useState<string | null>(null)
  const [rejectedImages, setRejectedImages] = useState<RejectedImage[]>([])
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null,
  )
  const previewUrls = useRef(new Set<string>())
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

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const addImages = (files: File[]) => {
    const { accepted, rejected } = selectImageFiles(
      files,
      MAX_PRODUCT_IMAGES - pendingImages.length,
    )
    setRejectedImages(rejected)
    if (accepted.length === 0) return
    const added = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      return { key: previewUrl, file, previewUrl }
    })
    setPendingImages((items) => [...items, ...added])
    if (!primaryKey) setPrimaryKey(added[0].key)
  }

  const removeImage = (key: string) => {
    const remaining = pendingImages.filter((item) => item.key !== key)
    setPendingImages(remaining)
    setRejectedImages([])
    if (primaryKey === key) setPrimaryKey(remaining[0]?.key ?? null)
  }

  const uploadImages = async (productId: string): Promise<number> => {
    const ordered = [
      ...pendingImages.filter((item) => item.key === primaryKey),
      ...pendingImages.filter((item) => item.key !== primaryKey),
    ]
    let failed = 0
    let primaryUploaded = false
    for (const [index, item] of ordered.entries()) {
      setUploadProgress({ current: index + 1, total: ordered.length })
      try {
        await productImagesService.upload(
          productId,
          item.file,
          { isPrimary: !primaryUploaded },
          token,
        )
        primaryUploaded = true
      } catch {
        failed += 1
      }
    }
    setUploadProgress(null)
    return failed
  }

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
      const failedImages = pendingImages.length > 0 ? await uploadImages(product.id) : 0
      onCreated(product, failedImages)
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

      <PendingImagesPicker
        items={pendingImages}
        primaryKey={primaryKey}
        rejected={rejectedImages}
        disabled={isSubmitting}
        onAdd={addImages}
        onRemove={removeImage}
        onSetPrimary={setPrimaryKey}
      />

      <p className="product-form__note">
        Solo se muestran categorías y unidades activas. El producto queda activo al registrarlo; las
        imágenes se suben después de crearlo y también puedes gestionarlas desde su detalle.
      </p>

      <div className="product-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || options.status !== 'success' || missingOptions}
        >
          {uploadProgress
            ? `Subiendo imágenes (${uploadProgress.current} de ${uploadProgress.total})...`
            : isSubmitting
              ? 'Registrando...'
              : 'Registrar producto'}
        </Button>
      </div>
    </form>
  )
}
