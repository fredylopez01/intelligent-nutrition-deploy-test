import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { Supplier, UpdateSupplierPayload } from '../../types/supplier'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'

import './SupplierForm.css'

const editSupplierSchema = z.object({
  commercialName: z.string().trim().max(200, 'El nombre comercial no puede superar 200 caracteres'),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono no puede superar 30 caracteres')
    .regex(/^\d*$/, 'El teléfono solo puede contener números, sin espacios ni símbolos'),
  address: z.string().trim().max(255, 'La dirección no puede superar 255 caracteres'),
})

type EditSupplierFormValues = z.infer<typeof editSupplierSchema>
type EditableField = keyof EditSupplierFormValues

const EDITABLE_FIELDS: EditableField[] = ['commercialName', 'phone', 'address']

const EMPTY_MESSAGES: Record<EditableField, string> = {
  commercialName: 'Ingresa el nombre comercial',
  phone: 'Ingresa el teléfono',
  address: 'Ingresa la dirección',
}

interface EditSupplierFormProps {
  supplier: Supplier
  onUpdated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'No tienes permiso para editar proveedores.'
    if (error.status === 404) return 'Este proveedor ya no existe. Recarga el listado.'
    return error.message
  }

  return 'No fue posible guardar los cambios. Intenta de nuevo.'
}

export function EditSupplierForm({ supplier, onUpdated, onCancel }: EditSupplierFormProps) {
  const { token } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const current: EditSupplierFormValues = {
    commercialName: supplier.commercialName ?? '',
    phone: supplier.person.phone ?? '',
    address: supplier.person.address ?? '',
  }

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditSupplierFormValues>({
    resolver: zodResolver(editSupplierSchema),
    defaultValues: current,
  })

  const onSubmit = async (values: EditSupplierFormValues) => {
    setSubmitError(null)

    const changes: UpdateSupplierPayload = {}
    let hasEmptyChange = false

    for (const field of EDITABLE_FIELDS) {
      const value = values[field].trim()
      if (value === current[field]) continue

      if (value === '') {
        setError(field, { type: 'manual', message: EMPTY_MESSAGES[field] })
        hasEmptyChange = true
        continue
      }

      changes[field] = value
    }

    if (hasEmptyChange) return

    if (Object.keys(changes).length === 0) {
      setSubmitError('No hay cambios por guardar.')
      return
    }

    try {
      await suppliersService.update(supplier.id, changes, token)
      onUpdated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  return (
    <form className="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <p className="supplier-form__note">
        Solo se pueden editar el nombre comercial, el teléfono y la dirección de{' '}
        <strong>{supplier.person.businessName ?? 'este proveedor'}</strong>.
      </p>

      <TextField
        id="edit-supplier-commercialName"
        label="Nombre comercial"
        autoComplete="off"
        error={errors.commercialName?.message}
        {...register('commercialName')}
      />
      <TextField
        id="edit-supplier-phone"
        label="Teléfono"
        autoComplete="tel"
        hint="Solo números, sin espacios ni símbolos."
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        id="edit-supplier-address"
        label="Dirección"
        autoComplete="street-address"
        error={errors.address?.message}
        {...register('address')}
      />

      <div className="supplier-form__actions">
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
