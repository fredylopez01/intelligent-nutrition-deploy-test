import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure } from '../../types/unit'
import {
  UNIT_API_CONFLICT_MESSAGES,
  apiConflictField,
  findUnitConflict,
  resolveUnitError,
  unitConflictMessage,
  unitSchema,
  type UnitFormValues,
} from '../../utils/units'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import '../categories/CategoryForm.css'

interface CreateUnitFormProps {
  onCreated: (unit: UnitOfMeasure) => void
  onCancel: () => void
}

export function CreateUnitForm({ onCreated, onCancel }: CreateUnitFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    defaultValues: { name: '', abbreviation: '' },
  })

  const onSubmit = async (values: UnitFormValues) => {
    setSubmitError(null)
    const conflict = await findUnitConflict(values, token)
    if (conflict) {
      setError(conflict.field, { message: unitConflictMessage(conflict) }, { shouldFocus: true })
      return
    }

    try {
      const unit = await unitsService.create(values, token)
      onCreated(unit)
    } catch (error) {
      const field = apiConflictField(error)
      if (field) {
        setError(field, { message: UNIT_API_CONFLICT_MESSAGES[field] }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolveUnitError(error, 'No fue posible registrar la unidad. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <TextField
        id="create-unit-name"
        label="Nombre"
        placeholder="Ej. Kilogramo"
        autoComplete="off"
        hint="Entre 5 y 50 caracteres. No puede repetirse con otra unidad."
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="create-unit-abbreviation"
        label="Abreviatura"
        placeholder="Ej. kg"
        autoComplete="off"
        hint="Hasta 10 caracteres, sin espacios. Es la que se ve junto a las cantidades."
        error={errors.abbreviation?.message}
        {...register('abbreviation')}
      />

      <p className="category-form__note">La unidad queda activa al registrarla.</p>

      <div className="category-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar unidad'}
        </Button>
      </div>
    </form>
  )
}
