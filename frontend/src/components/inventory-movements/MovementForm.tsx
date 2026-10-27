import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { useAuth } from '../../hooks/useAuth'
import type { InventoryBranchOption } from '../../hooks/useInventoryBranches'
import { useMovementLots } from '../../hooks/useMovementLots'
import { inventoryMovementsService } from '../../services/inventoryMovements.service'
import type { BranchInventoryItem } from '../../types/inventory'
import type { RegisteredMovement } from '../../types/inventoryMovement'
import { formatQuantity } from '../../utils/inventory'
import {
  MOVEMENT_TEXT_MAX_LENGTH,
  fefoLot,
  isCurrentLot,
  lotLabel,
  movementFieldError,
  movementSchema,
  resolveMovementError,
  type MovementValues,
} from '../../utils/inventoryMovements'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

import { BranchProductPicker } from './BranchProductPicker'

import './MovementForms.css'

interface MovementFormProps {
  branches: InventoryBranchOption[]
  defaultBranchId?: string
  onRegistered: (movement: RegisteredMovement) => void
  onCancel: () => void
}

export function MovementForm({
  branches,
  defaultBranchId,
  onRegistered,
  onCancel,
}: MovementFormProps) {
  const { token } = useAuth()
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '')
  const [item, setItem] = useState<BranchInventoryItem | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const branch = branches.find((option) => option.id === branchId) ?? null

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MovementValues>({
    resolver: zodResolver(movementSchema),
    defaultValues: { movementType: 'EXIT', quantity: '', expirationDate: '', observation: '' },
  })
  const movementType = useWatch({ control, name: 'movementType' })
  const quantityText = useWatch({ control, name: 'quantity' })
  const selectedLot = useWatch({ control, name: 'expirationDate' })
  const isEntry = movementType === 'ENTRY'

  const productId = item?.product.id ?? null
  const branchLots = useMovementLots('branch', branchId || null, productId)
  const generalLots = useMovementLots('general', null, isEntry ? productId : null)
  const lotsState = isEntry ? generalLots : branchLots
  const unit = item?.product.unitOfMeasure.abbreviation ?? 'und'

  const availableLots = isEntry
    ? lotsState.lots.filter((lot) => lot.quantity > 0 && isCurrentLot(lot))
    : lotsState.lots.filter((lot) => lot.quantity > 0)
  const lotOptions = availableLots.map((lot) => ({
    value: lot.expirationDate,
    label: lotLabel(lot, unit),
  }))
  const proposedLot = fefoLot(availableLots) ?? availableLots[0]
  const lotValue = availableLots.some((lot) => lot.expirationDate === selectedLot)
    ? selectedLot
    : (proposedLot?.expirationDate ?? '')
  const chosenLot = availableLots.find((lot) => lot.expirationDate === lotValue)
  const noLots = lotsState.status === 'success' && availableLots.length === 0

  const branchTotal = branchLots.lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : 0
  const resulting = isEntry ? branchTotal + quantity : branchTotal - quantity

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId)
    setItem(null)
    setSubmitError(null)
  }

  const onSubmit = async (values: MovementValues) => {
    if (!item || !branch) {
      setProductError('Elige el producto del movimiento.')
      return
    }
    setSubmitError(null)
    const lot = availableLots.find((option) => option.expirationDate === lotValue)
    if (lot && Number(values.quantity) > lot.quantity) {
      setError(
        'quantity',
        {
          message: isEntry
            ? `El stock general solo tiene ${formatQuantity(lot.quantity, unit)} de este lote.`
            : `El lote solo tiene ${formatQuantity(lot.quantity, unit)} en la sede.`,
        },
        { shouldFocus: true },
      )
      return
    }
    try {
      const movement = await inventoryMovementsService.create(
        {
          branchId: branch.id,
          productId: item.product.id,
          movementType: values.movementType,
          quantity: Number(values.quantity),
          expirationDate: lotValue,
          ...(values.observation ? { observation: values.observation } : {}),
        },
        token,
      )
      onRegistered(movement)
    } catch (error) {
      const fieldError = movementFieldError(error, unit)
      if (fieldError && fieldError.field !== 'branchId') {
        setError(fieldError.field, { message: fieldError.message }, { shouldFocus: true })
        return
      }
      setSubmitError(
        resolveMovementError(error, 'No fue posible registrar el movimiento. Intenta de nuevo.'),
      )
    }
  }

  const submit = () => {
    if (!item) setProductError('Elige el producto del movimiento.')
    setValue('expirationDate', lotValue)
    void handleSubmit(onSubmit)()
  }

  return (
    <div className="movement-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <fieldset className="movement-form__step">
        <legend className="movement-form__step-title">1. Tipo y sede</legend>
        <div className="movement-form__choices" role="radiogroup" aria-label="Tipo de movimiento">
          <label className="movement-form__choice">
            <input type="radio" value="EXIT" {...register('movementType')} />
            <span>
              Salida
              <small>Daño, pérdida o vencimiento. Sale de un lote de la sede.</small>
            </span>
          </label>
          <label className="movement-form__choice">
            <input type="radio" value="ENTRY" {...register('movementType')} />
            <span>
              Entrada
              <small>Llegan unidades del stock general a la sede.</small>
            </span>
          </label>
        </div>
        {branches.length > 1 ? (
          <SelectField
            id="movement-branch"
            label="Sede"
            options={branches.map((option) => ({ value: option.id, label: option.name }))}
            value={branchId}
            onChange={(event) => changeBranch(event.target.value)}
            disabled={isSubmitting}
          />
        ) : (
          <p className="movement-form__hint">Sede: {branch?.name}</p>
        )}
      </fieldset>

      <section className="movement-form__step" aria-labelledby="movement-product-title">
        <h3 id="movement-product-title" className="movement-form__step-title">
          2. Producto
        </h3>
        {branch && (
          <BranchProductPicker
            id="movement-product-search"
            branchId={branch.id}
            branchName={branch.name}
            selected={item}
            onSelect={(next) => {
              setItem(next)
              setProductError(null)
              setValue('expirationDate', '')
            }}
            disabled={isSubmitting}
            error={productError}
          />
        )}
      </section>

      <section className="movement-form__step" aria-labelledby="movement-lot-title">
        <h3 id="movement-lot-title" className="movement-form__step-title">
          3. Lote y cantidad
        </h3>
        {lotsState.status === 'error' && (
          <Alert tone="error">
            No fue posible cargar los lotes. Cambia de producto e intenta de nuevo.
          </Alert>
        )}
        {noLots && (
          <Alert tone="info">
            {isEntry
              ? `${item?.product.name} no tiene unidades vigentes en el stock general. Primero registra la recepción de una compra.`
              : `${item?.product.name} no tiene unidades en ${branch?.name}.`}
          </Alert>
        )}
        <div className="movement-form__row">
          <SelectField
            id="movement-lot"
            label={isEntry ? 'Lote del stock general' : 'Lote de la sede'}
            placeholder={lotsState.status === 'loading' ? 'Cargando lotes...' : 'Elige un lote'}
            options={lotOptions}
            value={lotValue}
            onChange={(event) => setValue('expirationDate', event.target.value)}
            disabled={!item || lotsState.status !== 'success' || noLots || isSubmitting}
            hint="Se propone el lote que vence primero."
            error={errors.expirationDate?.message}
          />
          <TextField
            id="movement-quantity"
            label="Cantidad"
            inputMode="numeric"
            autoComplete="off"
            hint={chosenLot ? `Máximo ${formatQuantity(chosenLot.quantity, unit)}.` : undefined}
            error={errors.quantity?.message}
            {...register('quantity')}
          />
        </div>
        {item && branchLots.status === 'success' && (
          <p className="movement-form__summary" aria-live="polite">
            <span>
              En {branch?.name}: <strong>{formatQuantity(branchTotal, unit)}</strong>
            </span>
            {quantity > 0 && (
              <span>
                Después del movimiento:{' '}
                <strong>{formatQuantity(Math.max(resulting, 0), unit)}</strong>
              </span>
            )}
          </p>
        )}
      </section>

      <TextAreaField
        id="movement-observation"
        label={isEntry ? 'Observación (opcional)' : 'Motivo de la salida'}
        rows={3}
        maxLength={MOVEMENT_TEXT_MAX_LENGTH}
        placeholder={
          isEntry ? 'Ej. Reposición para el fin de semana' : 'Ej. Empaque roto en bodega'
        }
        error={errors.observation?.message}
        {...register('observation')}
      />

      <div className="movement-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={isSubmitting || noLots || (item !== null && lotsState.status === 'loading')}
        >
          {isSubmitting ? 'Registrando...' : isEntry ? 'Registrar entrada' : 'Registrar salida'}
        </Button>
      </div>
    </div>
  )
}
