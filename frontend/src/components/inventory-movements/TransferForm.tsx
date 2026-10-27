import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import type { InventoryBranchOption } from '../../hooks/useInventoryBranches'
import { useMovementLots } from '../../hooks/useMovementLots'
import { inventoryService } from '../../services/inventory.service'
import { inventoryMovementsService } from '../../services/inventoryMovements.service'
import type { BranchInventoryItem, ProductAvailability } from '../../types/inventory'
import type { RegisteredMovement } from '../../types/inventoryMovement'
import { formatQuantity } from '../../utils/inventory'
import {
  MOVEMENT_TEXT_MAX_LENGTH,
  fefoLot,
  isCurrentLot,
  lotLabel,
  movementFieldError,
  resolveMovementError,
  transferSchema,
  type TransferValues,
} from '../../utils/inventoryMovements'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

import { BranchProductPicker } from './BranchProductPicker'

import './MovementForms.css'

interface TransferFormProps {
  originBranches: InventoryBranchOption[]
  defaultOriginId?: string
  onRegistered: (movement: RegisteredMovement) => void
  onCancel: () => void
}

interface DestinationsResult {
  productId: string
  status: 'success' | 'error'
  availability: ProductAvailability | null
}

export function TransferForm({
  originBranches,
  defaultOriginId,
  onRegistered,
  onCancel,
}: TransferFormProps) {
  const { token } = useAuth()
  const [originId, setOriginId] = useState(defaultOriginId ?? originBranches[0]?.id ?? '')
  const [item, setItem] = useState<BranchInventoryItem | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<DestinationsResult | null>(null)
  const origin = originBranches.find((option) => option.id === originId) ?? null
  const productId = item?.product.id ?? null
  const unit = item?.product.unitOfMeasure.abbreviation ?? 'und'

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { branchId: '', quantity: '', expirationDate: '', observation: '' },
  })
  const selectedLot = useWatch({ control, name: 'expirationDate' })
  const destinationId = useWatch({ control, name: 'branchId' })

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    inventoryService
      .availability(productId, token)
      .then((availability) => {
        if (!cancelled) setDestinations({ productId, status: 'success', availability })
      })
      .catch(() => {
        if (!cancelled) setDestinations({ productId, status: 'error', availability: null })
      })
    return () => {
      cancelled = true
    }
  }, [productId, token])

  const originLots = useMovementLots('branch', originId || null, productId)
  const availableLots = originLots.lots.filter((lot) => lot.quantity > 0 && isCurrentLot(lot))
  const proposedLot = fefoLot(availableLots)
  const lotValue = availableLots.some((lot) => lot.expirationDate === selectedLot)
    ? selectedLot
    : (proposedLot?.expirationDate ?? '')
  const chosenLot = availableLots.find((lot) => lot.expirationDate === lotValue)
  const noLots = originLots.status === 'success' && availableLots.length === 0

  const destinationsCurrent = destinations?.productId === productId ? destinations : null
  const destinationOptions = (destinationsCurrent?.availability?.branches ?? [])
    .filter((option) => option.branchId !== originId)
    .map((option) => ({
      value: option.branchId,
      label: `${option.branchName} · ${formatQuantity(option.quantity, unit)} vigentes`,
    }))

  const changeOrigin = (nextOriginId: string) => {
    setOriginId(nextOriginId)
    setItem(null)
    setSubmitError(null)
    setValue('branchId', '')
  }

  const onSubmit = async (values: TransferValues) => {
    if (!item || !origin) {
      setProductError('Elige el producto que vas a trasladar.')
      return
    }
    setSubmitError(null)
    if (chosenLot && Number(values.quantity) > chosenLot.quantity) {
      setError(
        'quantity',
        {
          message: `El lote solo tiene ${formatQuantity(chosenLot.quantity, unit)} en ${origin.name}.`,
        },
        { shouldFocus: true },
      )
      return
    }
    try {
      const movement = await inventoryMovementsService.transfer(
        {
          originBranchId: origin.id,
          branchId: values.branchId,
          productId: item.product.id,
          quantity: Number(values.quantity),
          expirationDate: lotValue,
          ...(values.observation ? { observation: values.observation } : {}),
        },
        token,
      )
      onRegistered(movement)
    } catch (error) {
      const fieldError = movementFieldError(error, unit)
      if (fieldError) {
        setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolveMovementError(error, 'No fue posible registrar el traslado. Intenta de nuevo.'),
      )
    }
  }

  const submit = () => {
    if (!item) setProductError('Elige el producto que vas a trasladar.')
    setValue('expirationDate', lotValue)
    void handleSubmit(onSubmit)()
  }

  return (
    <div className="movement-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <section className="movement-form__step" aria-labelledby="transfer-origin-title">
        <h3 id="transfer-origin-title" className="movement-form__step-title">
          1. Origen y producto
        </h3>
        {originBranches.length > 1 ? (
          <SelectField
            id="transfer-origin"
            label="Sede origen"
            options={originBranches.map((option) => ({ value: option.id, label: option.name }))}
            value={originId}
            onChange={(event) => changeOrigin(event.target.value)}
            disabled={isSubmitting}
          />
        ) : (
          <p className="movement-form__hint">Sede origen: {origin?.name}</p>
        )}
        {origin && (
          <BranchProductPicker
            id="transfer-product-search"
            branchId={origin.id}
            branchName={origin.name}
            selected={item}
            onSelect={(next) => {
              setItem(next)
              setProductError(null)
              setValue('expirationDate', '')
              setValue('branchId', '')
            }}
            disabled={isSubmitting}
            error={productError}
          />
        )}
      </section>

      <section className="movement-form__step" aria-labelledby="transfer-lot-title">
        <h3 id="transfer-lot-title" className="movement-form__step-title">
          2. Lote, destino y cantidad
        </h3>
        {originLots.status === 'error' && (
          <Alert tone="error">
            No fue posible cargar los lotes. Cambia de producto e intenta de nuevo.
          </Alert>
        )}
        {noLots && (
          <Alert tone="info">
            {item?.product.name} no tiene lotes vigentes con unidades en {origin?.name}. Los lotes
            vencidos no se trasladan.
          </Alert>
        )}
        {destinationsCurrent?.status === 'error' && (
          <Alert tone="error">No fue posible cargar las sedes destino. Intenta de nuevo.</Alert>
        )}
        <SelectField
          id="transfer-lot"
          label="Lote de la sede origen"
          placeholder={originLots.status === 'loading' ? 'Cargando lotes...' : 'Elige un lote'}
          options={availableLots.map((lot) => ({
            value: lot.expirationDate,
            label: lotLabel(lot, unit),
          }))}
          value={lotValue}
          onChange={(event) => setValue('expirationDate', event.target.value)}
          disabled={!item || originLots.status !== 'success' || noLots || isSubmitting}
          hint="Se propone el lote vigente que vence primero."
          error={errors.expirationDate?.message}
        />
        <div className="movement-form__row">
          <SelectField
            id="transfer-destination"
            label="Sede destino"
            placeholder={
              item && !destinationsCurrent ? 'Cargando sedes...' : 'Elige la sede destino'
            }
            options={destinationOptions}
            value={destinationId}
            onChange={(event) => setValue('branchId', event.target.value, { shouldValidate: true })}
            disabled={!item || !destinationsCurrent || isSubmitting}
            error={errors.branchId?.message}
          />
          <TextField
            id="transfer-quantity"
            label="Cantidad"
            inputMode="numeric"
            autoComplete="off"
            hint={chosenLot ? `Máximo ${formatQuantity(chosenLot.quantity, unit)}.` : undefined}
            error={errors.quantity?.message}
            {...register('quantity')}
          />
        </div>
        <p className="movement-form__hint">
          El producto debe estar asignado en la sede destino. Si el lote no existe allí, se crea con
          el stock mínimo que ya tiene el producto en esa sede.
        </p>
      </section>

      <TextAreaField
        id="transfer-observation"
        label="Observación (opcional)"
        rows={2}
        maxLength={MOVEMENT_TEXT_MAX_LENGTH}
        placeholder="Ej. Reposición para la sede Norte"
        error={errors.observation?.message}
        {...register('observation')}
      />

      <div className="movement-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={isSubmitting || noLots || (item !== null && originLots.status === 'loading')}
        >
          {isSubmitting ? 'Trasladando...' : 'Registrar traslado'}
        </Button>
      </div>
    </div>
  )
}
