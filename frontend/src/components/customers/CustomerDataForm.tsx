import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useAuth } from '../../hooks/useAuth'
import { useDocumentTypes } from '../../hooks/useDocumentTypes'
import { customersService } from '../../services/customers.service'
import type { Customer, UpdateCustomerPayload } from '../../types/customer'
import {
  DOCUMENT_CODES_BY_KIND,
  getCustomerKind,
  resolveCustomerError,
} from '../../utils/customers'
import { contactFields, validateDocumentNumber } from '../../utils/persons'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextField } from '../ui/TextField'

import './CustomerForm.css'

function buildSchema(codeById: Map<string, string>) {
  return z
    .object({
      isCompany: z.boolean(),
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
      if (values.isCompany) {
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

type CustomerDataValues = z.infer<ReturnType<typeof buildSchema>>

type Feedback = { tone: 'success' | 'error'; text: string } | null

interface CustomerDataFormProps {
  customer: Customer
  onSaved: (customer: Customer) => void
}

function toValues(customer: Customer): CustomerDataValues {
  return {
    isCompany: getCustomerKind(customer) === 'empresa',
    documentTypeId: customer.person.documentTypeId ?? '',
    documentNumber: customer.person.documentNumber,
    firstName: customer.person.firstName ?? '',
    lastName: customer.person.lastName ?? '',
    businessName: customer.person.businessName ?? '',
    email: customer.person.email,
    phone: customer.person.phone,
    address: customer.person.address,
  }
}

export function CustomerDataForm({ customer, onSaved }: CustomerDataFormProps) {
  const { token } = useAuth()
  const { documentTypes, isLoading: docTypesLoading, error: docTypesError } = useDocumentTypes()
  const [isEditing, setIsEditing] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const isCompany = getCustomerKind(customer) === 'empresa'
  const kindDocumentTypes = useMemo(
    () =>
      documentTypes.filter(
        (documentType) =>
          DOCUMENT_CODES_BY_KIND[isCompany ? 'empresa' : 'natural'].includes(documentType.code) &&
          (documentType.active || documentType.id === customer.person.documentTypeId),
      ),
    [documentTypes, isCompany, customer.person.documentTypeId],
  )
  const codeById = useMemo(
    () => new Map(kindDocumentTypes.map((documentType) => [documentType.id, documentType.code])),
    [kindDocumentTypes],
  )
  const schema = useMemo(() => buildSchema(codeById), [codeById])

  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CustomerDataValues>({
    resolver: zodResolver(schema),
    values: toValues(customer),
  })

  const startEditing = () => {
    setFeedback(null)
    setIsEditing(true)
    setTimeout(() => setFocus(isCompany ? 'businessName' : 'firstName'), 0)
  }

  const cancelEditing = () => {
    reset(toValues(customer))
    setIsEditing(false)
    setFeedback(null)
  }

  const onSubmit = async (values: CustomerDataValues) => {
    if (!isEditing) return
    setFeedback(null)
    const current = toValues(customer)
    const next = {
      ...(isCompany
        ? { businessName: values.businessName.trim() }
        : { firstName: values.firstName.trim(), lastName: values.lastName.trim() }),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      address: values.address.trim(),
    }
    const person = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) => value !== current[key as keyof CustomerDataValues],
      ),
    ) as UpdateCustomerPayload['person']

    // The API needs the document type and number together, so both travel
    // when either one changes.
    const documentNumber = values.documentNumber.trim()
    if (
      values.documentTypeId !== current.documentTypeId ||
      documentNumber !== current.documentNumber
    ) {
      person.documentTypeId = values.documentTypeId
      person.documentNumber = documentNumber
    }

    if (Object.keys(person).length === 0) {
      setFeedback({ tone: 'error', text: 'No hay cambios por guardar.' })
      return
    }

    try {
      const updated = await customersService.update(customer.id, { person }, token)
      setIsEditing(false)
      setFeedback({ tone: 'success', text: 'Cliente actualizado exitosamente.' })
      onSaved(updated)
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: resolveCustomerError(error, 'No fue posible guardar los cambios. Intenta de nuevo.'),
      })
    }
  }

  const readOnly = !isEditing

  return (
    <form
      className={`customer-form${readOnly ? ' customer-form--readonly' : ''}`}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {feedback && <Alert tone={feedback.tone}>{feedback.text}</Alert>}

      <p className="customer-form__section-title">Identificación</p>

      <div className="customer-form__row">
        {readOnly ? (
          <TextField
            id="customer-documentType"
            label="Tipo de documento"
            value={customer.person.documentType.name}
            readOnly
            aria-readonly
          />
        ) : docTypesError ? (
          <Alert tone="error">No fue posible cargar los tipos de documento.</Alert>
        ) : (
          <SelectField
            id="customer-documentTypeId"
            label="Tipo de documento"
            placeholder={docTypesLoading ? 'Cargando...' : 'Selecciona'}
            options={kindDocumentTypes.map((documentType) => ({
              value: documentType.id,
              label: documentType.name,
            }))}
            disabled={docTypesLoading}
            error={errors.documentTypeId?.message}
            {...register('documentTypeId')}
          />
        )}
        <TextField
          id="customer-documentNumber"
          label="Número de documento"
          readOnly={readOnly}
          autoComplete="off"
          error={errors.documentNumber?.message}
          hint={
            readOnly
              ? undefined
              : 'Se verifica que el documento no pertenezca a otra persona. Si esta persona también es proveedor o usuario, el cambio se refleja allí.'
          }
          {...register('documentNumber')}
        />
      </div>

      {isCompany ? (
        <TextField
          id="customer-businessName"
          label="Razón social"
          readOnly={readOnly}
          autoComplete="off"
          error={errors.businessName?.message}
          {...register('businessName')}
        />
      ) : (
        <div className="customer-form__row">
          <TextField
            id="customer-firstName"
            label="Nombres"
            readOnly={readOnly}
            autoComplete="off"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            id="customer-lastName"
            label="Apellidos"
            readOnly={readOnly}
            autoComplete="off"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      )}

      <p className="customer-form__section-title">Contacto</p>

      <TextField
        id="customer-email"
        label="Correo electrónico"
        type="email"
        readOnly={readOnly}
        autoComplete="off"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="customer-form__row">
        <TextField
          id="customer-phone"
          label="Teléfono"
          inputMode="numeric"
          readOnly={readOnly}
          autoComplete="off"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <TextField
          id="customer-address"
          label="Dirección"
          readOnly={readOnly}
          autoComplete="off"
          error={errors.address?.message}
          {...register('address')}
        />
      </div>

      <div className="customer-form__actions">
        {isEditing ? (
          <>
            <Button variant="outline" onClick={cancelEditing} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={startEditing}>
            Actualizar información
          </Button>
        )}
      </div>
    </form>
  )
}
