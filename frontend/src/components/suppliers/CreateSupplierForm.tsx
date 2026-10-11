import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { PersonSearchResult } from '../../types/person'
import {
  contactFields,
  getPersonName,
  prefillFromSearch,
  validateDocumentNumber,
} from '../../utils/persons'
import { PersonLookup } from '../persons/PersonLookup'
import { PersonSummary } from '../persons/PersonSummary'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './SupplierForm.css'

const commercialNameField = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre comercial')
  .max(200, 'El nombre comercial no puede superar 200 caracteres')

function buildSchema(codeById: Map<string, string>) {
  return z
    .object({
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
      ...contactFields,
      commercialName: commercialNameField,
    })
    .superRefine((values, context) => {
      const documentError = validateDocumentNumber(
        codeById.get(values.documentTypeId),
        values.documentNumber.trim(),
      )
      if (documentError) {
        context.addIssue({ code: 'custom', path: ['documentNumber'], message: documentError })
      }
    })
}

type CreateSupplierFormValues = z.infer<ReturnType<typeof buildSchema>>

interface CreateSupplierFormProps {
  onCreated: () => void
  onCancel: () => void
}

type Step =
  | { name: 'search' }
  | { name: 'existing'; person: PersonSearchResult }
  | { name: 'new'; initialValues: { documentNumber?: string; email?: string } }

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_ALREADY_IN_USE') {
      return 'Ese correo ya pertenece a otra persona registrada. Búscala o usa otro correo.'
    }
    if (error.status === 409) return 'Esta persona ya está registrada como proveedor.'
    if (error.status === 404) return 'La persona ya no existe o está inactiva. Búscala de nuevo.'
    if (error.status === 403) return 'No tienes permiso para registrar proveedores.'
    if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
    return error.message
  }
  return 'No fue posible registrar el proveedor. Intenta de nuevo.'
}

export function CreateSupplierForm({ onCreated, onCancel }: CreateSupplierFormProps) {
  const [step, setStep] = useState<Step>({ name: 'search' })

  if (step.name === 'existing') {
    return (
      <ExistingPersonStep
        person={step.person}
        onCreated={onCreated}
        onBack={() => setStep({ name: 'search' })}
        onCancel={onCancel}
      />
    )
  }

  if (step.name === 'new') {
    return (
      <NewSupplierForm
        initialValues={step.initialValues}
        onCreated={onCreated}
        onBack={() => setStep({ name: 'search' })}
        onCancel={onCancel}
      />
    )
  }

  return (
    <PersonLookup
      target="supplier"
      onSelect={(person) => setStep({ name: 'existing', person })}
      onCreateNew={(term) => setStep({ name: 'new', initialValues: prefillFromSearch(term) })}
      onCancel={onCancel}
    />
  )
}

interface ExistingPersonStepProps extends CreateSupplierFormProps {
  person: PersonSearchResult
  onBack: () => void
}

function ExistingPersonStep({ person, onCreated, onBack, onCancel }: ExistingPersonStepProps) {
  const { token } = useAuth()
  const [commercialName, setCommercialName] = useState(getPersonName(person))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    const parsed = commercialNameField.safeParse(commercialName)
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Ingresa el nombre comercial')
      return
    }
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await suppliersService.create({ personId: person.id, commercialName: parsed.data }, token)
      onCreated()
    } catch (error) {
      setSubmitError(resolveErrorMessage(error))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="supplier-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <PersonSummary person={person} onChange={onBack} disabled={isSubmitting} />

      <p className="supplier-form__section-title">Datos del proveedor</p>
      <TextField
        id="existing-supplier-commercialName"
        label="Nombre comercial"
        autoComplete="off"
        value={commercialName}
        error={fieldError ?? undefined}
        onChange={(event) => {
          setCommercialName(event.target.value)
          setFieldError(null)
        }}
      />

      <div className="supplier-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar proveedor'}
        </Button>
      </div>
    </div>
  )
}

interface NewSupplierFormProps extends CreateSupplierFormProps {
  initialValues: { documentNumber?: string; email?: string }
  onBack: () => void
}

function NewSupplierForm({ initialValues, onCreated, onBack, onCancel }: NewSupplierFormProps) {
  const { token } = useAuth()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const activeDocumentTypes = useMemo(
    () => documentTypes.filter((documentType) => documentType.active),
    [documentTypes],
  )
  const codeById = useMemo(
    () => new Map(activeDocumentTypes.map((documentType) => [documentType.id, documentType.code])),
    [activeDocumentTypes],
  )
  const schema = useMemo(() => buildSchema(codeById), [codeById])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateSupplierFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      documentTypeId: '',
      documentNumber: initialValues.documentNumber ?? '',
      businessName: '',
      email: initialValues.email ?? '',
      phone: '',
      address: '',
      commercialName: '',
    },
  })

  const onSubmit = async (values: CreateSupplierFormValues) => {
    setSubmitError(null)
    try {
      await suppliersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            businessName: values.businessName.trim(),
            email: values.email.trim().toLowerCase(),
            phone: values.phone.trim(),
            address: values.address.trim(),
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

  const docTypeOptions = activeDocumentTypes.map((documentType) => ({
    value: documentType.id,
    label: documentType.name,
  }))

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
          placeholder="Ej. 900123456-7"
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
          inputMode="numeric"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      <TextField
        id="create-supplier-address"
        label="Dirección"
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
        <Button
          variant="ghost"
          className="supplier-form__back"
          onClick={onBack}
          disabled={isSubmitting}
        >
          ← Volver a buscar
        </Button>
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
