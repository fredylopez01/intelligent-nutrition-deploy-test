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
  ADJUSTMENT_REASON_MIN_LENGTH,
  MOVEMENT_TEXT_MAX_LENGTH,
  NEW_LOT_VALUE,
  adjustmentSchema,
  fefoLot,
  lotLabel,
  movementFieldError,
  resolveMovementError,
  type AdjustmentValues,
} from '../../utils/inventoryMovements'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { SelectField } from '../ui/SelectField'
import { TextAreaField } from '../ui/TextAreaField'
import { TextField } from '../ui/TextField'

import { BranchProductPicker } from './BranchProductPicker'

import './MovementForms.css'

interface AdjustmentFormProps {
  branches: InventoryBranchOption[]
  defaultBranchId?: string
  onRegistered: (movement: RegisteredMovement) => void
  onCancel: () => void
}

export function AdjustmentForm({
  branches,
  defaultBranchId,
  onRegistered,
  onCancel,
}: AdjustmentFormProps) {
  const { token } = useAuth()
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '')
  const [item, setItem] = useState<BranchInventoryItem | null>(null)
  const [productError, setProductError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const branch = branches.find((option) => option.id === branchId) ?? null
  const unit = item?.product.unitOfMeasure.abbreviation ?? 'und'

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      movementType: 'ADJUSTMENT_EXIT',
      quantity: '',
      expirationDate: '',
      newLotDate: '',
      reason: '',
    },
  })
  const movementType = useWatch({ control, name: 'movementType' })
  const selectedLot = useWatch({ control, name: 'expirationDate' })
  const reason = useWatch({ control, name: 'reason' })
  const isEntry = movementType === 'ADJUSTMENT_ENTRY'

  const lots = useMovementLots('branch', branchId || null, item?.product.id ?? null)
  const choosableLots = isEntry ? lots.lots : lots.lots.filter((lot) => lot.quantity > 0)
  const lotOptions = [
    ...choosableLots.map((lot) => ({ value: lot.expirationDate, label: lotLabel(lot, unit) })),
    ...(isEntry ? [{ value: NEW_LOT_VALUE, label: 'Lote nuevo (otra fecha de vencimiento)' }] : []),
  ]
  const proposed =
    fefoLot(choosableLots)?.expirationDate ??
    (isEntry ? NEW_LOT_VALUE : (choosableLots[0]?.expirationDate ?? ''))
  const lotValue = lotOptions.some((option) => option.value === selectedLot)
    ? selectedLot
    : proposed
  const chosenLot = choosableLots.find((lot) => lot.expirationDate === lotValue)
  const noLots = !isEntry && lots.status === 'success' && choosableLots.length === 0

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId)
    setItem(null)
    setSubmitError(null)
  }

  const onSubmit = async (values: AdjustmentValues) => {
    if (!item || !branch) {
      setProductError('Elige el producto que vas a ajustar.')
      return
    }
    setSubmitError(null)
    if (!isEntry && chosenLot && Number(values.quantity) > chosenLot.quantity) {
      setError(
        'quantity',
        { message: `El lote solo tiene ${formatQuantity(chosenLot.quantity, unit)} en la sede.` },
        { shouldFocus: true },
      )
      return
    }
    try {
      const movement = await inventoryMovementsService.adjust(
        {
          branchId: branch.id,
          productId: item.product.id,
          movementType: values.movementType,
          quantity: Number(values.quantity),
          expirationDate: lotValue === NEW_LOT_VALUE ? values.newLotDate : lotValue,
          reason: values.reason,
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
        resolveMovementError(error, 'No fue posible registrar el ajuste. Intenta de nuevo.'),
      )
    }
  }

  const submit = () => {
    if (!item) setProductError('Elige el producto que vas a ajustar.')
    setValue('expirationDate', lotValue)
    void handleSubmit(onSubmit)()
  }

  return (
    <div className="movement-form">
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <fieldset className="movement-form__step">
        <legend className="movement-form__step-title">1. Tipo de ajuste y sede</legend>
        <div className="movement-form__choices" role="radiogroup" aria-label="Tipo de ajuste">
          <label className="movement-form__choice">
            <input type="radio" value="ADJUSTMENT_EXIT" {...register('movementType')} />
            <span>
              Ajuste de salida
              <small>El conteo físico encontró menos unidades que el sistema.</small>
            </span>
          </label>
          <label className="movement-form__choice">
            <input type="radio" value="ADJUSTMENT_ENTRY" {...register('movementType')} />
            <span>
              Ajuste de entrada
              <small>El conteo físico encontró más unidades que el sistema.</small>
            </span>
          </label>
        </div>
        <SelectField
          id="adjustment-branch"
          label="Sede"
          options={branches.map((option) => ({ value: option.id, label: option.name }))}
          value={branchId}
          onChange={(event) => changeBranch(event.target.value)}
          disabled={isSubmitting}
        />
      </fieldset>

      <section className="movement-form__step" aria-labelledby="adjustment-product-title">
        <h3 id="adjustment-product-title" className="movement-form__step-title">
          2. Producto
        </h3>
        {branch && (
          <BranchProductPicker
            id="adjustment-product-search"
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

      <section className="movement-form__step" aria-labelledby="adjustment-lot-title">
        <h3 id="adjustment-lot-title" className="movement-form__step-title">
          3. Lote y cantidad
        </h3>
        {lots.status === 'error' && (
          <Alert tone="error">
            No fue posible cargar los lotes. Cambia de producto e intenta de nuevo.
          </Alert>
        )}
        {noLots && (
          <Alert tone="info">
            {item?.product.name} no tiene unidades en {branch?.name}: no hay nada que restar.
          </Alert>
        )}
        <div className="movement-form__row">
          <SelectField
            id="adjustment-lot"
            label="Lote"
            placeholder={lots.status === 'loading' ? 'Cargando lotes...' : 'Elige un lote'}
            options={lotOptions}
            value={lotValue}
            onChange={(event) => setValue('expirationDate', event.target.value)}
            disabled={!item || lots.status !== 'success' || noLots || isSubmitting}
            error={errors.expirationDate?.message}
          />
          <TextField
            id="adjustment-quantity"
            label="Cantidad"
            inputMode="numeric"
            autoComplete="off"
            hint={
              !isEntry && chosenLot
                ? `Máximo ${formatQuantity(chosenLot.quantity, unit)}.`
                : undefined
            }
            error={errors.quantity?.message}
            {...register('quantity')}
          />
        </div>
        {isEntry && lotValue === NEW_LOT_VALUE && (
          <TextField
            id="adjustment-new-lot"
            label="Vencimiento del lote nuevo"
            type="date"
            error={errors.newLotDate?.message}
            {...register('newLotDate')}
          />
        )}
      </section>

      <TextAreaField
        id="adjustment-reason"
        label="Razón del ajuste"
        rows={3}
        maxLength={MOVEMENT_TEXT_MAX_LENGTH}
        length={reason.length}
        placeholder="Ej. Diferencia detectada en el conteo físico del cierre del 25 de octubre"
        hint={`Mínimo ${ADJUSTMENT_REASON_MIN_LENGTH} caracteres. Queda en el movimiento y en la auditoría.`}
        error={errors.reason?.message}
        {...register('reason')}
      />

      <p className="movement-form__hint">
        El ajuste no toca el stock general. Se permite aunque la sede ya haya cerrado el día; en ese
        caso queda auditado como ajuste posterior al cierre.
      </p>

      <div className="movement-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button
          onClick={submit}
          disabled={isSubmitting || noLots || (item !== null && lots.status === 'loading')}
        >
          {isSubmitting ? 'Registrando...' : 'Registrar ajuste'}
        </Button>
      </div>
    </div>
  )
}
