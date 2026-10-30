import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { purchasesService } from '../../services/purchases.service'
import type { Purchase, ReceiptItemPayload } from '../../types/purchase'
import { todayInputValue } from '../../utils/inventory'
import { resolvePurchaseError } from '../../utils/purchases'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import '../inventory-movements/MovementForms.css'
import './Purchases.css'

interface ReceiptFormProps {
  purchase: Purchase
  onReceived: (purchase: Purchase) => void
  onCancel: () => void
}

interface LotRow {
  key: number
  quantity: string
  expirationDate: string
  observation: string
}

const WHOLE_PATTERN = /^\d{1,9}$/

let nextKey = 0
const newLot = (quantity = ''): LotRow => {
  nextKey += 1
  return { key: nextKey, quantity, expirationDate: '', observation: '' }
}

export function ReceiptForm({ purchase, onReceived, onCancel }: ReceiptFormProps) {
  const { token } = useAuth()
  const pendingItems = purchase.items.filter(
    (item) => item.requestedQuantity - item.receivedQuantity > 0,
  )
  const [lots, setLots] = useState<Record<string, LotRow[]>>(() =>
    Object.fromEntries(
      pendingItems.map((item) => [
        item.id,
        [newLot(String(item.requestedQuantity - item.receivedQuantity))],
      ]),
    ),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const today = todayInputValue()

  const updateLot = (itemId: string, key: number, changes: Partial<LotRow>) =>
    setLots((current) => ({
      ...current,
      [itemId]: current[itemId].map((lot) => (lot.key === key ? { ...lot, ...changes } : lot)),
    }))

  const lotError = (lot: LotRow): string | null => {
    const quantity = lot.quantity.trim()
    if (quantity === '') return null
    if (!WHOLE_PATTERN.test(quantity)) return 'Cantidad entera de 0 en adelante.'
    if (Number(quantity) > 0 && !lot.expirationDate) return 'Escribe el vencimiento del lote.'
    if (Number(quantity) > 0 && lot.expirationDate < today) {
      return 'El lote ya está vencido: no puede entrar al stock general.'
    }
    return null
  }

  const lineError = (itemId: string, pending: number): string | null => {
    const received = (lots[itemId] ?? []).reduce(
      (sum, lot) => sum + (WHOLE_PATTERN.test(lot.quantity.trim()) ? Number(lot.quantity) : 0),
      0,
    )
    if (received > pending) return `Solo faltan ${pending} por recibir en esta línea.`
    const dates = (lots[itemId] ?? [])
      .filter((lot) => Number(lot.quantity) > 0)
      .map((lot) => lot.expirationDate)
    if (new Set(dates).size !== dates.length) {
      return 'Dos lotes tienen el mismo vencimiento: súmalos en una sola fila.'
    }
    return null
  }

  const submit = async () => {
    setShowErrors(true)
    setSubmitError(null)
    const invalid = pendingItems.some(
      (item) =>
        lineError(item.id, item.requestedQuantity - item.receivedQuantity) !== null ||
        (lots[item.id] ?? []).some((lot) => lotError(lot) !== null),
    )
    if (invalid) return
    const payload: ReceiptItemPayload[] = pendingItems.flatMap((item) =>
      (lots[item.id] ?? [])
        .filter((lot) => Number(lot.quantity) > 0)
        .map((lot) => ({
          purchaseDetailId: item.id,
          receivedQuantity: Number(lot.quantity),
          expirationDate: lot.expirationDate,
          ...(lot.observation.trim() ? { observation: lot.observation.trim() } : {}),
        })),
    )
    if (payload.length === 0) {
      setSubmitError('Escribe al menos una cantidad recibida.')
      return
    }
    setSubmitting(true)
    try {
      onReceived(await purchasesService.receive(purchase.id, payload, token))
    } catch (error) {
      setSubmitError(
        resolvePurchaseError(error, 'No fue posible registrar la recepción. Intenta de nuevo.'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="movement-form">
      <Alert tone="info">
        Lo recibido entra al stock general con su fecha de vencimiento. Si una línea llegó en varios
        lotes, agrega una fila por lote. Puedes recibir por partes.
      </Alert>
      {submitError && <Alert tone="error">{submitError}</Alert>}

      <ul className="receipt-form__lines" aria-label="Líneas por recibir">
        {pendingItems.map((item) => {
          const pending = item.requestedQuantity - item.receivedQuantity
          const error = showErrors ? lineError(item.id, pending) : null
          return (
            <li key={item.id} className="receipt-form__line">
              <div className="receipt-form__head">
                <span className="movement-form__product-name">{item.productName}</span>
                <span className="movement-form__product-meta">
                  {item.referenceCode} · faltan {pending} de {item.requestedQuantity}
                </span>
              </div>
              {(lots[item.id] ?? []).map((lot, index) => {
                const rowError = showErrors ? lotError(lot) : null
                const label = `${item.productName}, lote ${index + 1}`
                return (
                  <div key={lot.key} className="receipt-form__lot">
                    <div className="purchase-form__field">
                      <label htmlFor={`receipt-qty-${lot.key}`}>Recibido</label>
                      <input
                        id={`receipt-qty-${lot.key}`}
                        aria-label={`Cantidad recibida de ${label}`}
                        className={`ui-field__control${rowError ? ' ui-field__control--invalid' : ''}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={lot.quantity}
                        onChange={(event) =>
                          updateLot(item.id, lot.key, { quantity: event.target.value })
                        }
                        disabled={submitting}
                      />
                    </div>
                    <div className="purchase-form__field">
                      <label htmlFor={`receipt-exp-${lot.key}`}>Vence</label>
                      <input
                        id={`receipt-exp-${lot.key}`}
                        aria-label={`Vencimiento de ${label}`}
                        type="date"
                        min={today}
                        className={`ui-field__control${rowError ? ' ui-field__control--invalid' : ''}`}
                        value={lot.expirationDate}
                        onChange={(event) =>
                          updateLot(item.id, lot.key, { expirationDate: event.target.value })
                        }
                        disabled={submitting}
                      />
                    </div>
                    <div className="purchase-form__field receipt-form__note">
                      <label htmlFor={`receipt-note-${lot.key}`}>Observación</label>
                      <input
                        id={`receipt-note-${lot.key}`}
                        aria-label={`Observación de ${label}`}
                        className="ui-field__control"
                        maxLength={500}
                        placeholder="Opcional"
                        value={lot.observation}
                        onChange={(event) =>
                          updateLot(item.id, lot.key, { observation: event.target.value })
                        }
                        disabled={submitting}
                      />
                    </div>
                    {(lots[item.id] ?? []).length > 1 && (
                      <button
                        type="button"
                        className="purchase-form__remove"
                        aria-label={`Quitar ${label}`}
                        onClick={() =>
                          setLots((current) => ({
                            ...current,
                            [item.id]: current[item.id].filter((row) => row.key !== lot.key),
                          }))
                        }
                        disabled={submitting}
                      >
                        ×
                      </button>
                    )}
                    {rowError && (
                      <span className="ui-field__error receipt-form__error" role="alert">
                        {rowError}
                      </span>
                    )}
                  </div>
                )
              })}
              <button
                type="button"
                className="movement-form__change receipt-form__add"
                onClick={() =>
                  setLots((current) => ({ ...current, [item.id]: [...current[item.id], newLot()] }))
                }
                disabled={submitting}
              >
                Agregar otro lote de {item.productName}
              </button>
              {error && (
                <span className="ui-field__error" role="alert">
                  {error}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="movement-form__actions">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={() => void submit()} disabled={submitting}>
          {submitting ? 'Registrando...' : 'Confirmar recepción'}
        </Button>
      </div>
    </div>
  )
}
