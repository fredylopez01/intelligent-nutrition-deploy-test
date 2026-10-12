import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { categoriesService } from '../../services/categories.service'
import type { Category } from '../../types/category'
import {
  categorySchema,
  duplicateNameMessage,
  findCategoryWithName,
  isDuplicateNameError,
  resolveCategoryError,
  type CategoryFormValues,
} from '../../utils/categories'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import { CategoryFields } from './CategoryFields'

import './CategoryForm.css'

interface CreateCategoryFormProps {
  onCreated: (category: Category) => void
  onCancel: () => void
}

export function CreateCategoryForm({ onCreated, onCancel }: CreateCategoryFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  })
  const description = useWatch({ control, name: 'description' })

  const onSubmit = async (values: CategoryFormValues) => {
    setSubmitError(null)
    const duplicate = await findCategoryWithName(values.name, token)
    if (duplicate) {
      setError('name', { message: duplicateNameMessage(duplicate) }, { shouldFocus: true })
      return
    }

    try {
      const category = await categoriesService.create(
        { name: values.name, description: values.description },
        token,
      )
      onCreated(category)
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
        resolveCategoryError(error, 'No fue posible registrar la categoría. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <CategoryFields
        idPrefix="create-category"
        register={register}
        errors={errors}
        descriptionLength={description.length}
      />

      <p className="category-form__note">La categoría queda activa al registrarla.</p>

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar categoría'}
        </Button>
      </div>
    </form>
  )
}
