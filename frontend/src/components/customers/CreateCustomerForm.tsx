import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { customersService } from '../../services/customers.service'
import type { Customer, CustomerKind } from '../../types/customer'
import type { PersonSearchResult } from '../../types/person'
import {
  CUSTOMER_KIND_LABELS,
  DOCUMENT_CODES_BY_KIND,
  resolveCustomerError,
} from '../../utils/customers'
import { contactFields, prefillFromSearch, validateDocumentNumber } from '../../utils/persons'
import { PersonLookup } from '../persons/PersonLookup'
import { PersonSummary } from '../persons/PersonSummary'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './CustomerForm.css'

const KINDS: CustomerKind[] = ['natural', 'empresa']

function buildSchema(codeById: Map<string, string>) {
  return z
    .object({
      kind: z.enum(['natural', 'empresa']),
      documentTypeId: z.string().min(1, 'Selecciona el tipo de documento'),
      documentNumber: z
        .string()
        .trim()
        .min(1, 'Ingresa el número de documento')
        .max(50, 'El número de documento no puede superar 50 caracteres'),
      firstName: z.string().trim().max(100, 'Los nombres no pueden superar 100 caracteres'),
      lastName: z.string().trim().max(100, 'Los apellidos no pueden superar 100 caracteres'),
      businessName: z.string().trim().max(200, 'La razón social no puede superar 200 caracteres'),
      ...contactFields,
    })
    .superRefine((values, context) => {
      const documentError = validateDocumentNumber(
        codeById.get(values.documentTypeId),
        values.documentNumber.trim(),
      )
      if (documentError) {
        context.addIssue({ code: 'custom', path: ['documentNumber'], message: documentError })
      }
      if (values.kind === 'natural') {
        if (!values.firstName.trim()) {
          context.addIssue({ code: 'custom', path: ['firstName'], message: 'Ingresa los nombres' })
        }
        if (!values.lastName.trim()) {
          context.addIssue({ code: 'custom', path: ['lastName'], message: 'Ingresa los apellidos' })
        }
      } else if (!values.businessName.trim()) {
        context.addIssue({
          code: 'custom',
          path: ['businessName'],
          message: 'Ingresa la razón social',
        })
      }
    })
}

type CreateCustomerValues = z.infer<ReturnType<typeof buildSchema>>

interface CreateCustomerFormProps {
  onCreated: (customer: Customer, reusedPerson: boolean) => void
  onCancel: () => void
}

interface NewCustomerFormProps extends CreateCustomerFormProps {
  initialValues: { documentNumber?: string; email?: string }
  onBack: () => void
}

type Step =
  | { name: 'search' }
  | { name: 'existing'; person: PersonSearchResult }
  | { name: 'new'; initialValues: { documentNumber?: string; email?: string } }

export function CreateCustomerForm({ onCreated, onCancel }: CreateCustomerFormProps) {
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
      <NewCustomerForm
        initialValues={step.initialValues}
        onCreated={onCreated}
        onBack={() => setStep({ name: 'search' })}
        onCancel={onCancel}
      />
    )
  }

  return (
    <PersonLookup
      target="customer"
      onSelect={(person) => setStep({ name: 'existing', person })}
      onCreateNew={(term) => setStep({ name: 'new', initialValues: prefillFromSearch(term) })}
      onCancel={onCancel}
    />
  )
}

interface ExistingPersonStepProps extends CreateCustomerFormProps {
  person: PersonSearchResult
  onBack: () => void
}

function ExistingPersonStep({ person, onCreated, onBack, onCancel }: ExistingPersonStepProps) {
  const { token } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const customer = await customersService.create({ personId: person.id }, token)
      onCreated(customer, false)
    } catch (error) {
      setSubmitError(
        resolveCustomerError(error, 'No fue posible registrar el cliente. Intenta de nuevo.'),
      )
      setIsSubmitting(false)
    }
  }

  return (
    <div className="customer-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}
      <PersonSummary person={person} onChange={onBack} disabled={isSubmitting} />
      <p className="customer-form__note">
        Se registrará como cliente con estos datos. Si algo cambió, actualízalo desde el detalle del
        cliente.
      </p>
      <div className="customer-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button onClick={() => void handleConfirm()} disabled={isSubmitting}>
          {isSubmitting ? 'Registrando...' : 'Registrar cliente'}
        </Button>
      </div>
    </div>
  )
}

function NewCustomerForm({ initialValues, onCreated, onBack, onCancel }: NewCustomerFormProps) {
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
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateCustomerValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: 'natural',
      documentTypeId: '',
      documentNumber: initialValues.documentNumber ?? '',
      firstName: '',
      lastName: '',
      businessName: '',
      email: initialValues.email ?? '',
      phone: '',
      address: '',
    },
  })

  const kind = useWatch({ control, name: 'kind' })
  const documentTypeId = useWatch({ control, name: 'documentTypeId' })
  const docTypeOptions = activeDocumentTypes
    .filter((documentType) => DOCUMENT_CODES_BY_KIND[kind].includes(documentType.code))
    .map((documentType) => ({ value: documentType.id, label: documentType.name }))

  const changeKind = (nextKind: CustomerKind) => {
    if (nextKind === kind) return
    setValue('kind', nextKind)
    const allowed = activeDocumentTypes.filter((documentType) =>
      DOCUMENT_CODES_BY_KIND[nextKind].includes(documentType.code),
    )
    const keepCurrent = allowed.some((documentType) => documentType.id === documentTypeId)
    if (!keepCurrent) {
      setValue('documentTypeId', allowed.length === 1 ? allowed[0].id : '')
    }
  }

  const onSubmit = async (values: CreateCustomerValues) => {
    setSubmitError(null)
    const isCompany = values.kind === 'empresa'
    const email = values.email.trim().toLowerCase()
    const typedName = isCompany
      ? values.businessName.trim()
      : `${values.firstName.trim()} ${values.lastName.trim()}`

    try {
      const customer = await customersService.create(
        {
          person: {
            documentTypeId: values.documentTypeId,
            documentNumber: values.documentNumber.trim(),
            ...(isCompany
              ? { businessName: values.businessName.trim() }
              : { firstName: values.firstName.trim(), lastName: values.lastName.trim() }),
            email,
            phone: values.phone.trim(),
            address: values.address.trim(),
          },
        },
        token,
      )
      const reusedPerson = customer.person.email !== email || customer.fullName !== typedName
      onCreated(customer, reusedPerson)
    } catch (error) {
      setSubmitError(
        resolveCustomerError(error, 'No fue posible registrar el cliente. Intenta de nuevo.'),
      )
    }
  }

  const blocked = docTypesLoading || docTypesError

  return (
    <form className="customer-form" onSubmit={handleSubmit(onSubmit)} noValidate>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <fieldset className="customer-form__kinds">
        <legend className="customer-form__section-title">Tipo de cliente</legend>
        {KINDS.map((option) => (
          <label
            key={option}
            className={`customer-form__kind${kind === option ? ' customer-form__kind--checked' : ''}`}
          >
            <input
              type="radio"
              name="customer-kind"
              value={option}
              className="sr-only"
              checked={kind === option}
              onChange={() => changeKind(option)}
            />
            <span className="customer-form__kind-radio" aria-hidden="true" />
            <span className="customer-form__kind-name">{CUSTOMER_KIND_LABELS[option]}</span>
            <span className="customer-form__kind-hint">
              {option === 'natural' ? 'Cédula, cédula de extranjería o pasaporte' : 'Con NIT'}
            </span>
          </label>
        ))}
      </fieldset>

      <p className="customer-form__section-title">Identificación</p>

      {docTypesError ? (
        <Alert tone="error">
          No fue posible cargar los tipos de documento. Cierra e intenta de nuevo.
        </Alert>
      ) : (
        <div className="customer-form__row">
          <SelectField
            id="create-customer-documentTypeId"
            label="Tipo de documento"
            placeholder={docTypesLoading ? 'Cargando...' : 'Selecciona'}
            options={docTypeOptions}
            disabled={docTypesLoading}
            value={documentTypeId}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
          <TextField
            id="create-customer-documentNumber"
            label="Número de documento"
            placeholder={kind === 'empresa' ? 'Ej. 900123456-7' : 'Ej. 1049123456'}
            autoComplete="off"
            error={errors.documentNumber?.message}
            {...register('documentNumber')}
          />
        </div>
      )}

      {kind === 'natural' ? (
        <div className="customer-form__row">
          <TextField
            id="create-customer-firstName"
            label="Nombres"
            placeholder="Ej. Laura"
            autoComplete="off"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            id="create-customer-lastName"
            label="Apellidos"
            placeholder="Ej. Pérez"
            autoComplete="off"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      ) : (
        <TextField
          id="create-customer-businessName"
          label="Razón social"
          placeholder="Ej. Gimnasio Fuerza Boyacá SAS"
          autoComplete="off"
          error={errors.businessName?.message}
          {...register('businessName')}
        />
      )}

      <p className="customer-form__section-title">Contacto</p>

      <TextField
        id="create-customer-email"
        label="Correo electrónico"
        type="email"
        placeholder="cliente@correo.com"
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="customer-form__row">
        <TextField
          id="create-customer-phone"
          label="Teléfono"
          inputMode="numeric"
          placeholder="Ej. 3001234567"
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="create-customer-address"
          label="Dirección"
          placeholder="Ej. Calle 20 # 10-15, Tunja"
          autoComplete="off"
          error={errors.address?.message}
          {...register('address')}
        />
      </div>

      <div className="customer-form__actions">
        <Button
          variant="ghost"
          className="customer-form__back"
          onClick={onBack}
          disabled={isSubmitting}
        >
          ← Volver a buscar
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || blocked}>
          {isSubmitting ? 'Registrando...' : 'Registrar cliente'}
        </Button>
      </div>
    </form>
  )
}
