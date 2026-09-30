import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { ApiError } from '../../services/http'
import { branchesService } from '../../services/branches.service'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import './BranchForm.css'

const createBranchSchema = z.object({
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
    .max(30, 'El teléfono no puede superar 30 caracteres'),
})

type CreateBranchFormValues = z.infer<typeof createBranchSchema>

interface CreateBranchFormProps {
  onCreated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese nombre ya está registrado en otra sede.'
    if (error.status === 403) return 'No tienes permiso para registrar sedes.'
    return error.message
  }

  return 'No fue posible registrar la sede. Intenta de nuevo.'
}

export function CreateBranchForm({ onCreated, onCancel }: CreateBranchFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateBranchFormValues>({
    resolver: zodResolver(createBranchSchema),
    defaultValues: { name: '', address: '', phone: '' },
  })

  const onSubmit = async (values: CreateBranchFormValues) => {
    setSubmitError(null)
    try {
      await branchesService.create(
        {
          name: values.name.trim(),
          address: values.address.trim(),
          phone: values.phone.trim(),
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  return (
    <form className="branch-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <TextField
        id="create-branch-name"
        label="Nombre"
        placeholder="Ej. Sucursal Centro"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        id="create-branch-address"
        label="Dirección"
        placeholder="Ej. Carrera 10 # 20-30"
        autoComplete="street-address"
        error={errors.address?.message}
        {...register('address')}
      />
      <TextField
        id="create-branch-phone"
        label="Teléfono"
        placeholder="Ej. 6010000000"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div className="branch-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar sede'}
        </Button>
      </div>
    </form>
  )
}
