import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { ApiError } from '../../services/http'
import { suppliersService } from '../../services/suppliers.service'
import type { PersonSearchResult } from '../../types/person'
import {
  PERSON_KIND_DOCUMENT_CODES,
  contactFields,
  getPersonName,
  prefillFromSearch,
  validateDocumentNumber,
} from '../../utils/persons'
import type { SupplierKind } from '../../utils/suppliers'
import { PersonLookup } from '../persons/PersonLookup'
import { PersonSummary } from '../persons/PersonSummary'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './SupplierForm.css'

const KINDS: Array<{ value: SupplierKind; label: string; hint: string }> = [
  { value: 'natural', label: 'Persona natural', hint: 'Cédula, cédula de extranjería o pasaporte' },
  { value: 'empresa', label: 'Empresa', hint: 'Con NIT' },
]

const commercialNameField = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre comercial')
  .max(200, 'El nombre comercial no puede superar 200 caracteres')

function buildSchema(kind: SupplierKind, codeById: Map<string, string>) {
  return z
    .object({
      documentTypeId: z.string().min(1, 'Selecciona un tipo de documento'),
      documentNumber: z
        .string()
        .trim()
        .min(1, 'Ingresa el número de documento')
        .max(50, 'El número de documento no puede superar 50 caracteres'),
      businessName: z.string().trim().max(200, 'La razón social no puede superar 200 caracteres'),
      firstName: z.string().trim().max(100, 'Los nombres no pueden superar 100 caracteres'),
      lastName: z.string().trim().max(100, 'Los apellidos no pueden superar 100 caracteres'),
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
      if (kind === 'empresa') {
        if (!values.businessName.trim()) {
          context.addIssue({
            code: 'custom',
            path: ['businessName'],
            message: 'Ingresa la razón social',
          })
        }
        return
      }
      if (!values.firstName.trim()) {
        context.addIssue({ code: 'custom', path: ['firstName'], message: 'Ingresa los nombres' })
      }
      if (!values.lastName.trim()) {
        context.addIssue({ code: 'custom', path: ['lastName'], message: 'Ingresa los apellidos' })
      }
    })
}

type NewSupplierValues = z.infer<ReturnType<typeof buildSchema>>

interface CreateSupplierFormProps {
  onCreated: () => void
  onCancel: () => void
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ALREADY_SUPPLIER') return 'Esta persona ya está registrada como proveedor.'
    if (error.code === 'EMAIL_ALREADY_IN_USE') {
      return 'Ese correo ya pertenece a otra persona registrada. Búscala o usa otro correo.'
    }
    if (error.status === 404) return 'La persona ya no existe o está inactiva. Búscala de nuevo.'
    if (error.status === 403) return 'No tienes permiso para registrar proveedores.'
    if (error.status === 400) return 'Revisa los datos: hay un campo que el servidor no aceptó.'
    return error.message
  }
  return 'No fue posible registrar el proveedor. Intenta de nuevo.'
}

type Step =
  | { name: 'search' }
  | { name: 'existing'; person: PersonSearchResult }
  | { name: 'new'; initialValues: { documentNumber?: string; email?: string } }

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
      <p className="supplier-form__note">
        Se registrará como proveedor con sus datos guardados. Si algo cambió, actualízalo después
        desde "Editar".
      </p>

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
  const [kind, setKind] = useState<SupplierKind>('natural')
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const kindDocumentTypes = useMemo(
    () =>
      documentTypes.filter(
        (documentType) =>
          documentType.active && PERSON_KIND_DOCUMENT_CODES[kind].includes(documentType.code),
      ),
    [documentTypes, kind],
  )
  const codeById = useMemo(
    () => new Map(kindDocumentTypes.map((documentType) => [documentType.id, documentType.code])),
    [kindDocumentTypes],
  )
  const schema = useMemo(() => buildSchema(kind, codeById), [kind, codeById])

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NewSupplierValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      documentTypeId: '',
      documentNumber: initialValues.documentNumber ?? '',
      businessName: '',
      firstName: '',
      lastName: '',
      email: initialValues.email ?? '',
      phone: '',
      address: '',
      commercialName: '',
    },
  })

  const documentTypeId = useWatch({ control, name: 'documentTypeId' })

  useEffect(() => {
    const current = getValues('documentTypeId')
    if (kindDocumentTypes.some((documentType) => documentType.id === current)) return
    setValue('documentTypeId', kindDocumentTypes.length === 1 ? kindDocumentTypes[0].id : '')
  }, [kindDocumentTypes, getValues, setValue])

  const onSubmit = async (values: NewSupplierValues) => {
    setSubmitError(null)
    try {
      await suppliersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            ...(kind === 'empresa'
              ? { businessName: values.businessName.trim() }
              : { firstName: values.firstName.trim(), lastName: values.lastName.trim() }),
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

  const docTypeOptions = kindDocumentTypes.map((documentType) => ({
    value: documentType.id,
    label: documentType.name,
  }))

  return (
    <form className="supplier-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <fieldset className="supplier-form__kinds">
        <legend className="supplier-form__section-title">Tipo de proveedor</legend>
        {KINDS.map((item) => (
          <label
            key={item.value}
            className={`supplier-form__kind${kind === item.value ? ' supplier-form__kind--checked' : ''}`}
          >
            <input
              type="radio"
              name="supplier-kind"
              value={item.value}
              className="sr-only"
              checked={kind === item.value}
              onChange={() => setKind(item.value)}
            />
            <span className="supplier-form__kind-radio" aria-hidden="true" />
            <span className="supplier-form__kind-name">{item.label}</span>
            <span className="supplier-form__kind-hint">{item.hint}</span>
          </label>
        ))}
      </fieldset>

      <p className="supplier-form__section-title">Identificación</p>

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
            value={documentTypeId}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
        )}
        <TextField
          id="create-supplier-documentNumber"
          label="Número de documento"
          placeholder={kind === 'empresa' ? 'Ej. 900123456-7' : 'Ej. 1049123456'}
          autoComplete="off"
          error={errors.documentNumber?.message}
          {...register('documentNumber')}
        />
      </div>

      {kind === 'empresa' ? (
        <TextField
          id="create-supplier-businessName"
          label="Razón social"
          placeholder="Ej. Suplementos Colombia SAS"
          autoComplete="organization"
          error={errors.businessName?.message}
          {...register('businessName')}
        />
      ) : (
        <div className="supplier-form__row">
          <TextField
            id="create-supplier-firstName"
            label="Nombres"
            placeholder="Ej. Carlos Andrés"
            autoComplete="off"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            id="create-supplier-lastName"
            label="Apellidos"
            placeholder="Ej. Ríos Mora"
            autoComplete="off"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      )}

      <p className="supplier-form__section-title">Contacto</p>

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
