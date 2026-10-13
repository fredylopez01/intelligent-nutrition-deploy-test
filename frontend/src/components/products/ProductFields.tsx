import type { FieldErrors, UseFormRegister } from 'react-hook-form'

import type { Category } from '../../types/category'
import type { Product } from '../../types/product'
import type { UnitOfMeasure } from '../../types/unit'
import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  formatPrice,
  isValidPrice,
  toPriceString,
  type ProductFormValues,
} from '../../utils/products'
import { SelectField } from '../ui/SelectField'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

interface ProductFieldsProps {
  idPrefix: string
  register: UseFormRegister<ProductFormValues>
  errors: FieldErrors<ProductFormValues>
  values: Pick<ProductFormValues, 'categoryId' | 'unitOfMeasureId' | 'price' | 'description'>
  categories: Category[]
  units: UnitOfMeasure[]
  optionsLoading: boolean
  referenceCodeLocked?: boolean
  readOnlyProduct?: Product
}

function optionLabel(name: string, active: boolean): string {
  return active ? name : `${name} (inactiva)`
}

export function ProductFields({
  idPrefix,
  register,
  errors,
  values,
  categories,
  units,
  optionsLoading,
  referenceCodeLocked = false,
  readOnlyProduct,
}: ProductFieldsProps) {
  const readOnly = readOnlyProduct !== undefined
  const pricePreview =
    !readOnly && isValidPrice(values.price) ? formatPrice(toPriceString(values.price)) : null

  return (
    <>
      <p className="product-form__section-title">Identificación</p>
      <div className="product-form__row">
        <TextField
          id={`${idPrefix}-name`}
          label="Nombre"
          placeholder="Ej. Whey Protein 2 lb"
          autoComplete="off"
          readOnly={readOnly}
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          id={`${idPrefix}-referenceCode`}
          label="Código de referencia"
          placeholder="Ej. WHEY-2LB-001"
          autoComplete="off"
          readOnly={readOnly || referenceCodeLocked}
          aria-readonly={readOnly || referenceCodeLocked}
          hint={
            readOnly
              ? undefined
              : referenceCodeLocked
                ? 'El código no se puede cambiar después de crear el producto.'
                : 'Entre 2 y 50 caracteres: letras, números, guiones (-) o guion bajo (_). No puede repetirse.'
          }
          error={errors.referenceCode?.message}
          {...register('referenceCode')}
        />
      </div>

      <TextAreaField
        id={`${idPrefix}-description`}
        label={readOnly ? 'Descripción' : 'Descripción (opcional)'}
        placeholder={readOnly ? 'Sin descripción' : 'Ej. Proteína de suero sabor vainilla'}
        rows={3}
        readOnly={readOnly}
        maxLength={PRODUCT_DESCRIPTION_MAX_LENGTH}
        length={readOnly ? undefined : values.description.length}
        error={errors.description?.message}
        {...register('description')}
      />

      <p className="product-form__section-title">Clasificación y precio</p>
      <div className="product-form__row">
        {readOnly ? (
          <TextField
            id={`${idPrefix}-category`}
            label="Categoría"
            value={readOnlyProduct.category.name}
            readOnly
            aria-readonly
          />
        ) : (
          <SelectField
            id={`${idPrefix}-categoryId`}
            label="Categoría"
            placeholder={optionsLoading ? 'Cargando...' : 'Selecciona'}
            disabled={optionsLoading}
            value={values.categoryId}
            options={categories.map((category) => ({
              value: category.id,
              label: optionLabel(category.name, category.active),
            }))}
            error={errors.categoryId?.message}
            {...register('categoryId')}
          />
        )}
        {readOnly ? (
          <TextField
            id={`${idPrefix}-unit`}
            label="Unidad de medida"
            value={`${readOnlyProduct.unitOfMeasure.name} (${readOnlyProduct.unitOfMeasure.abbreviation})`}
            readOnly
            aria-readonly
          />
        ) : (
          <SelectField
            id={`${idPrefix}-unitOfMeasureId`}
            label="Unidad de medida"
            placeholder={optionsLoading ? 'Cargando...' : 'Selecciona'}
            disabled={optionsLoading}
            value={values.unitOfMeasureId}
            options={units.map((unit) => ({
              value: unit.id,
              label: optionLabel(`${unit.name} (${unit.abbreviation})`, unit.active),
            }))}
            error={errors.unitOfMeasureId?.message}
            {...register('unitOfMeasureId')}
          />
        )}
      </div>

      <TextField
        id={`${idPrefix}-price`}
        label="Precio de venta (COP)"
        placeholder="Ej. 145000"
        inputMode="decimal"
        autoComplete="off"
        readOnly={readOnly}
        hint={
          readOnly
            ? undefined
            : [
                pricePreview
                  ? `Se mostrará como ${pricePreview}.`
                  : 'Sin puntos de miles. Hasta 2 decimales.',
                referenceCodeLocked ? 'Un cambio de precio solo aplica a ventas futuras.' : null,
              ]
                .filter(Boolean)
                .join(' ')
        }
        error={errors.price?.message}
        {...register('price')}
      />
    </>
  )
}
