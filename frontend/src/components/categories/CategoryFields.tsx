import type { FieldErrors, UseFormRegister } from 'react-hook-form'

import { CATEGORY_DESCRIPTION_MAX_LENGTH, type CategoryFormValues } from '../../utils/categories'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

interface CategoryFieldsProps {
  idPrefix: string
  register: UseFormRegister<CategoryFormValues>
  errors: FieldErrors<CategoryFormValues>
  descriptionLength: number
}

export function CategoryFields({
  idPrefix,
  register,
  errors,
  descriptionLength,
}: CategoryFieldsProps) {
  return (
    <>
      <TextField
        id={`${idPrefix}-name`}
        label="Nombre"
        placeholder="Ej. Proteínas"
        autoComplete="off"
        hint="Entre 3 y 100 caracteres. No puede repetirse con otra categoría."
        error={errors.name?.message}
        {...register('name')}
      />
      <TextAreaField
        id={`${idPrefix}-description`}
        label="Descripción"
        placeholder="Ej. Suplementos de proteína en polvo y barras"
        rows={3}
        maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
        length={descriptionLength}
        error={errors.description?.message}
        {...register('description')}
      />
    </>
  )
}
