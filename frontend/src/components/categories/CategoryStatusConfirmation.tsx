import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { categoriesService } from '../../services/categories.service'
import type { Category } from '../../types/category'
import { resolveCategoryError } from '../../utils/categories'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import './CategoryForm.css'

interface CategoryStatusConfirmationProps {
  category: Category
  onChanged: (category: Category) => void
  onCancel: () => void
}

export function CategoryStatusConfirmation({
  category,
  onChanged,
  onCancel,
}: CategoryStatusConfirmationProps) {
  const { token } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const targetActive = !category.active

  const handleConfirm = async () => {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await categoriesService.updateStatus(category.id, { active: targetActive }, token)
      onChanged({ ...category, active: targetActive })
    } catch (error) {
      setSubmitError(
        resolveCategoryError(
          error,
          'No fue posible cambiar el estado de la categoría. Intenta de nuevo.',
        ),
      )
      setIsSubmitting(false)
    }
  }

  return (
    <div className="category-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          variant={targetActive ? 'primary' : 'danger'}
          onClick={() => void handleConfirm()}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Guardando...' : targetActive ? 'Sí, activar' : 'Sí, desactivar'}
        </Button>
      </div>
    </div>
  )
}
