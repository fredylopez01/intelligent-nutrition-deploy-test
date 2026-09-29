import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './SupplierForm.css'

const createSupplierSchema = z.object({
  documentTypeId: z.string().min(1, 'Selecciona un tipo de documento'),
  documentNumber: z
    .string()
    .trim()
    .min(1, 'Ingresa el número de documento')
    .max(50, 'El número de documento no puede superar 50 caracteres'),
  businessName: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre o razón social')
    .max(200, 'El nombre no puede superar 200 caracteres'),
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .email('Ingresa un correo válido')
    .max(150, 'El correo no puede superar 150 caracteres'),
  phone: z
    .string()
    .trim()
    .min(1, 'Ingresa el teléfono')
    .max(30, 'El teléfono no puede superar 30 caracteres'),
  address: z
    .string()
    .trim()
    .max(255, 'La dirección no puede superar 255 caracteres')
    .optional()
    .or(z.literal('')),
  commercialName: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre comercial')
    .max(200, 'El nombre comercial no puede superar 200 caracteres'),
})

type CreateSupplierFormValues = z.infer<typeof createSupplierSchema>

interface CreateSupplierFormProps {
  onCreated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Esta persona ya está registrada como proveedor.'
    if (error.status === 403) return 'No tienes permiso para registrar proveedores.'
    return error.message
  }

  return 'No fue posible registrar el proveedor. Intenta de nuevo.'
}

export function CreateSupplierForm({ onCreated, onCancel }: CreateSupplierFormProps) {
  const { token } = useAuth()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierFormValues>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      documentTypeId: '',
      documentNumber: '',
      businessName: '',
      email: '',
      phone: '',
      address: '',
      commercialName: '',
    },
  })

  const onSubmit = async (values: CreateSupplierFormValues) => {
    setSubmitError(null)
    try {
      const address = values.address?.trim()
      await suppliersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            businessName: values.businessName.trim(),
            email: values.email.trim().toLowerCase(),
            phone: values.phone.trim(),
            ...(address ? { address } : {}),
          },
          commercialName: values.commercialName.trim(),
        },
        token,
      )
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
    }
  }

  const docTypeOptions = documentTypes
    .filter((dt) => dt.active)
    .map((dt) => ({ value: dt.id, label: dt.name }))

  return (
    <form className="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <p className="supplier-form__section-title">Datos de la persona</p>

      <div className="supplier-form__row">
        {docTypesError ? (
          <Alert tone="error">
            No fue posible cargar los tipos de documento. Cierra el formulario y vuelve a
            intentarlo.
          </Alert>
        ) : (
          <SelectField
            id="create-supplier-documentTypeId"
            label="Tipo de documento"
            placeholder={docTypesLoading ? 'Cargando...' : 'Selecciona'}
            options={docTypeOptions}
            disabled={docTypesLoading}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
        )}
        <TextField
          id="create-supplier-documentNumber"
          label="Número de documento"
          placeholder="Ej. 900123456"
          autoComplete="off"
          error={errors.documentNumber?.message}
          {...register('documentNumber')}
        />
      </div>

      <TextField
        id="create-supplier-businessName"
        label="Nombre o razón social"
        placeholder="Ej. Suplementos Colombia SAS"
        autoComplete="organization"
        error={errors.businessName?.message}
        {...register('businessName')}
      />

      <div className="supplier-form__row">
        <TextField
          id="create-supplier-email"
          label="Correo electrónico"
          type="email"
          placeholder="contacto@ejemplo.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="create-supplier-phone"
          label="Teléfono"
          placeholder="Ej. 3001234567"
          autoComplete="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      <TextField
        id="create-supplier-address"
        label="Dirección (opcional)"
        placeholder="Ej. Calle 10 # 20-30"
        autoComplete="street-address"
        error={errors.address?.message}
        {...register('address')}
      />

      <p className="supplier-form__section-title">Datos del proveedor</p>

      <TextField
        id="create-supplier-commercialName"
        label="Nombre comercial"
        placeholder="Ej. Suplementos Colombia"
        autoComplete="off"
        error={errors.commercialName?.message}
        {...register('commercialName')}
      />

      <div className="supplier-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || docTypesLoading || !!docTypesError}>
          {isSubmitting ? 'Registrando...' : 'Registrar proveedor'}
        </Button>
      </div>
    </form>
  )
}
