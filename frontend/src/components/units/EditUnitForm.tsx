import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import { unitsService } from '../../services/units.service'
import type { UnitOfMeasure, UpdateUnitPayload } from '../../types/unit'
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

interface EditUnitFormProps {
  unit: UnitOfMeasure
  onUpdated: (unit: UnitOfMeasure) => void
  onCancel: () => void
}

export function EditUnitForm({ unit, onUpdated, onCancel }: EditUnitFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const current = { name: unit.name, abbreviation: unit.abbreviation }
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({
    resolver: zodResolver(unitSchema),
    values: current,
  })

  const onSubmit = async (values: UnitFormValues) => {
    setSubmitError(null)
    const payload: UpdateUnitPayload = {}
    if (values.name !== current.name) payload.name = values.name
    if (values.abbreviation !== current.abbreviation) payload.abbreviation = values.abbreviation

    if (Object.keys(payload).length === 0) {
      setSubmitError('No hay cambios por guardar.')
      return
    }

    const conflict = await findUnitConflict(values, token, unit.id)
    if (conflict) {
      setError(conflict.field, { message: unitConflictMessage(conflict) }, { shouldFocus: true })
      return
    }

    try {
      const updated = await unitsService.update(unit.id, payload, token)
      onUpdated({ ...unit, ...updated })
    } catch (error) {
      const field = apiConflictField(error)
      if (field) {
        setError(field, { message: UNIT_API_CONFLICT_MESSAGES[field] }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolveUnitError(error, 'No fue posible guardar los cambios. Intenta de nuevo.'),
      )
    }
  }

  return (
    <form className="category-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <TextField
        id="edit-unit-name"
        label="Nombre"
        autoComplete="off"
        hint="Entre 5 y 50 caracteres. No puede repetirse con otra unidad."
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="edit-unit-abbreviation"
        label="Abreviatura"
        autoComplete="off"
        hint="Hasta 10 caracteres, sin espacios."
        error={errors.abbreviation?.message}
        {...register('abbreviation')}
      />

      <p className="category-form__note">
        Los productos que ya usan esta unidad mostrarán el nuevo nombre y abreviatura.
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
