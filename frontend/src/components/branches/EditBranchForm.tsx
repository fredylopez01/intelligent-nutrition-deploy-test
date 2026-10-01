import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { branchesService } from '../../services/branches.service'
import { ApiError } from '../../services/http'
import type { Branch } from '../../types/branch'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import './BranchForm.css'

const editBranchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre de la sede')
    .max(100, 'El nombre no puede superar 100 caracteres'),
  address: z
    .string()
    .trim()
    .min(1, 'Ingresa la dirección')
    .max(255, 'La dirección no puede superar 255 caracteres'),
  phone: z
    .string()
    .trim()
    .min(1, 'Ingresa el teléfono')
    .max(30, 'El teléfono no puede superar 30 caracteres')
    .regex(/^\d+$/, 'El teléfono solo puede contener números, sin espacios ni símbolos'),
})

type EditBranchFormValues = z.infer<typeof editBranchSchema>

interface EditBranchFormProps {
  branch: Branch
  onUpdated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese nombre ya está registrado en otra sede.'
    if (error.status === 403) return 'No tienes permiso para editar sedes.'
    if (error.status === 404) return 'Esta sede ya no existe. Recarga el listado.'
    return error.message
  }

  return 'No fue posible guardar los cambios. Intenta de nuevo.'
}

export function EditBranchForm({ branch, onUpdated, onCancel }: EditBranchFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditBranchFormValues>({
    resolver: zodResolver(editBranchSchema),
    defaultValues: { name: branch.name, address: branch.address, phone: branch.phone },
  })

  const onSubmit = async (values: EditBranchFormValues) => {
    setSubmitError(null)
    const name = values.name.trim()
    const address = values.address.trim()
    const phone = values.phone.trim()
    const nameChanged = name !== branch.name
    const addressChanged = address !== branch.address
    const phoneChanged = phone !== branch.phone

    if (!nameChanged && !addressChanged && !phoneChanged) {
      setSubmitError('No hay cambios por guardar.')
      return
    }

    try {
      await branchesService.update(
        branch.id,
        {
          ...(nameChanged ? { name } : {}),
          ...(addressChanged ? { address } : {}),
          ...(phoneChanged ? { phone } : {}),
        },
        token,
      )
      onUpdated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  return (
    <form className="branch-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <TextField
        id="edit-branch-name"
        label="Nombre"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="edit-branch-address"
        label="Dirección"
        autoComplete="street-address"
        error={errors.address?.message}
        {...register('address')}
      />
      <TextField
        id="edit-branch-phone"
        label="Teléfono"
        autoComplete="tel"
        hint="Solo números, sin espacios ni símbolos."
        error={errors.phone?.message}
        {...register('phone')}
      />

      <div className="branch-form__actions">
        <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  )
}
