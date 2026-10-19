import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { categoriesService } from '../../services/categories.service'
import type { Category, UpdateCategoryPayload } from '../../types/category'
import {
  categorySchema,
  duplicateNameMessage,
  findCategoryWithName,
  isDuplicateNameError,
  normalizeCategoryName,
  resolveCategoryError,
  type CategoryFormValues,
} from '../../utils/categories'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { CategoryFields } from './CategoryFields'

import './CategoryForm.css'

interface EditCategoryFormProps {
  category: Category
  onUpdated: (category: Category) => void
  onCancel: () => void
}

export function EditCategoryForm({ category, onUpdated, onCancel }: EditCategoryFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const current = { name: category.name, description: category.description ?? '' }
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    values: current,
  })
  const description = useWatch({ control, name: 'description' })

  const onSubmit = async (values: CategoryFormValues) => {
    setSubmitError(null)
    const payload: UpdateCategoryPayload = {}
    if (values.name !== current.name) payload.name = values.name
    if (values.description !== current.description) payload.description = values.description

    if (Object.keys(payload).length === 0) {
      setSubmitError('No hay cambios por guardar.')
      return
    }

    if (
      payload.name !== undefined &&
      normalizeCategoryName(payload.name) !== normalizeCategoryName(current.name)
    ) {
      const duplicate = await findCategoryWithName(payload.name, token, category.id)
      if (duplicate) {
        setError('name', { message: duplicateNameMessage(duplicate) }, { shouldFocus: true })
        return
      }
    }

    try {
      const updated = await categoriesService.update(category.id, payload, token)
      onUpdated({ ...category, ...updated })
    } catch (error) {
      if (isDuplicateNameError(error)) {
        setError(
          'name',
          { message: 'Ya existe una categoría con ese nombre. Usa uno diferente.' },
          { shouldFocus: true },
        )
        return
      }
      setSubmitError(
        resolveCategoryError(error, 'No fue posible guardar los cambios. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <CategoryFields
        idPrefix="edit-category"
        register={register}
        errors={errors}
        descriptionLength={description.length}
      />

      <p className="category-form__note">
        El nuevo nombre se verá en los productos que ya usan esta categoría.
      </p>

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
