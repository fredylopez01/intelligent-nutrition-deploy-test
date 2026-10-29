import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { ApiError } from '../../services/http'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import type { ClosureCount, InventoryClosure } from '../../types/inventoryClosure'
import { expirationState, formatExpirationDate, formatQuantity } from '../../utils/inventory'
import {
  CLOSURE_OBSERVATION_MAX_LENGTH,
  countError,
  lotKey,
  resolveClosureError,
} from '../../utils/inventoryClosures'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

import './InventoryClosures.css'

interface ClosureCountFormProps {
  closure: InventoryClosure
  onSaved: (closure: InventoryClosure) => void
  onConfirmed?: (closure: InventoryClosure) => void
}

interface RowValue {
  quantity: string
  observation: string
}

function initialValues(closure: InventoryClosure): Record<string, RowValue> {
  return Object.fromEntries(
    closure.items.map((item) => [
      lotKey(item),
      {
        quantity: item.physicalQuantity === null ? '' : String(item.physicalQuantity),
        observation: item.observation ?? '',
      },
    ]),
  )
}

export function ClosureCountForm({ closure, onSaved, onConfirmed }: ClosureCountFormProps) {
  const { token } = useAuth()
  const [values, setValues] = useState(() => initialValues(closure))
  const [baseline, setBaseline] = useState(() => initialValues(closure))
  const [showErrors, setShowErrors] = useState(false)
  const [markMissing, setMarkMissing] = useState(false)
  const [busy, setBusy] = useState<'save' | 'confirm' | null>(null)
  const [message, setMessage] = useState<{
    tone: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const keys = closure.items.map(lotKey)
  const rowError = (key: string) => countError(values[key]?.quantity ?? '')
  const invalidKeys = keys.filter((key) => rowError(key) !== null)
  const filledKeys = keys.filter((key) => (values[key]?.quantity ?? '').trim() !== '')
  const missing = keys.length - filledKeys.length
  const dirtyKeys = keys.filter(
    (key) =>
      values[key]?.quantity.trim() !== baseline[key]?.quantity.trim() ||
      values[key]?.observation.trim() !== baseline[key]?.observation.trim(),
  )
  const progress = keys.length === 0 ? 100 : Math.round((filledKeys.length / keys.length) * 100)

  const update = (key: string, field: keyof RowValue, value: string) => {
    setValues((current) => ({ ...current, [key]: { ...current[key], [field]: value } }))
    setMessage(null)
  }

  const buildCounts = (onlyDirty: boolean): ClosureCount[] =>
    closure.items
      .filter((item) => {
        const key = lotKey(item)
        const quantity = values[key]?.quantity.trim() ?? ''
        return quantity !== '' && (!onlyDirty || dirtyKeys.includes(key))
      })
      .map((item) => {
        const value = values[lotKey(item)]
        const observation = value.observation.trim()
        return {
          productId: item.productId,
          expirationDate: item.expirationDate ?? '',
          physicalQuantity: Number(value.quantity.trim()),
          ...(observation ? { observation } : {}),
        }
      })

  const persist = async (): Promise<InventoryClosure | null> => {
    const counts = buildCounts(true)
    if (counts.length === 0) return null
    const saved = await inventoryClosuresService.saveCounts(closure.id, counts, token)
    setBaseline(values)
    onSaved(saved)
    return saved
  }

  const save = async () => {
    setShowErrors(true)
    if (invalidKeys.length > 0) {
      setMessage({ tone: 'error', text: 'Hay cantidades que no son válidas. Revisa las marcadas.' })
      return
    }
    if (dirtyKeys.length === 0) {
      setMessage({ tone: 'info', text: 'No hay cambios por guardar.' })
      return
    }
    setBusy('save')
    try {
      await persist()
      setMessage({
        tone: 'success',
        text: `Conteo guardado. Llevas ${filledKeys.length} de ${keys.length} lotes contados.`,
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: resolveClosureError(error, 'No fue posible guardar el conteo. Intenta de nuevo.'),
      })
    } finally {
      setBusy(null)
    }
  }

  const requestConfirm = () => {
    setShowErrors(true)
    setMarkMissing(true)
    if (invalidKeys.length > 0 || missing > 0) {
      setMessage({
        tone: 'error',
        text:
          missing > 0
            ? `Faltan ${missing === 1 ? '1 lote' : `${missing} lotes`} por contar. Escribe 0 si no encontraste unidades.`
            : 'Hay cantidades que no son válidas. Revisa las marcadas.',
      })
      return
    }
    setConfirmOpen(true)
  }

  const confirm = async () => {
    if (!onConfirmed) return
    setBusy('confirm')
    try {
      await persist()
      const confirmed = await inventoryClosuresService.confirm(closure.id, token)
      setConfirmOpen(false)
      onConfirmed(confirmed)
    } catch (error) {
      setConfirmOpen(false)
      const pending =
        error instanceof ApiError && error.code === 'INCOMPLETE_COUNT'
          ? ((error.details as { pending?: { productName: string }[] } | undefined)?.pending ?? [])
          : []
      setMessage({
        tone: 'error',
        text:
          pending.length > 0
            ? `Faltan por contar: ${pending.map((item) => item.productName).join(', ')}.`
            : resolveClosureError(error, 'No fue posible confirmar el cierre. Intenta de nuevo.'),
      })
    } finally {
      setBusy(null)
    }
  }

  if (closure.items.length === 0) {
    return (
      <div className="closure-count">
        <Alert tone="info">
          La sede no tenía unidades en ningún lote al iniciar el cierre: no hay nada que contar.
        </Alert>
        {onConfirmed && (
          <div className="closure-card__actions">
            <Button onClick={() => setConfirmOpen(true)} disabled={busy !== null}>
              Confirmar cierre
            </Button>
          </div>
        )}
        <ConfirmDialog
          open={confirmOpen}
          busy={busy === 'confirm'}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void confirm()}
        />
      </div>
    )
  }

  return (
    <div className="closure-count">
      <div className="closure-count__progress">
        <div className="closure-count__progress-text">
          <strong>
            {filledKeys.length} de {keys.length}
          </strong>{' '}
          lotes contados
          {dirtyKeys.length > 0 && (
            <span className="closure-count__dirty"> · cambios sin guardar</span>
          )}
        </div>
        <div
          className="closure-count__bar"
          role="progressbar"
          aria-label="Avance del conteo"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="closure-count__list" role="table" aria-label="Lotes a contar">
        <div className="closure-count__head" role="row">
          <span role="columnheader">Producto y lote</span>
          <span role="columnheader">Cantidad esperada</span>
          <span role="columnheader">Cantidad contada</span>
          <span role="columnheader">Observación</span>
        </div>
        {closure.items.map((item) => {
          const key = lotKey(item)
          const empty = (values[key]?.quantity ?? '').trim() === ''
          const error = showErrors
            ? (rowError(key) ?? (markMissing && empty ? 'Falta contar este lote.' : null))
            : null
          const expired = item.expirationDate
            ? expirationState(item.expirationDate).state === 'expired'
            : false
          const lotText = item.expirationDate
            ? `Vence ${formatExpirationDate(item.expirationDate)}`
            : 'Sin lote'
          const quantityId = `count-${key}`
          return (
            <div key={key} className="closure-count__row" role="row">
              <div className="closure-count__product" role="cell">
                <span className="closure-count__name">{item.productName}</span>
                <span className="closure-count__meta">
                  {item.referenceCode} · {lotText}
                  {expired && <span className="closure-count__expired">Vencido</span>}
                </span>
              </div>
              <div className="closure-count__expected" role="cell">
                <span className="closure-count__expected-label">Esperado</span>
                <span className="closure-count__expected-value">
                  {item.systemQuantity === undefined
                    ? '—'
                    : formatQuantity(item.systemQuantity, item.unit)}
                </span>
              </div>
              <div className="closure-count__field" role="cell">
                <label className="sr-only" htmlFor={quantityId}>
                  Cantidad contada de {item.productName}, {lotText.toLocaleLowerCase('es')}
                </label>
                <div className="closure-count__quantity">
                  <input
                    id={quantityId}
                    className={`ui-field__control${error ? ' ui-field__control--invalid' : ''}`}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="—"
                    value={values[key]?.quantity ?? ''}
                    aria-invalid={!!error}
                    onChange={(event) => update(key, 'quantity', event.target.value)}
                    disabled={busy !== null}
                  />
                  <span className="closure-count__unit">{item.unit}</span>
                </div>
                {error && (
                  <span className="ui-field__error" role="alert">
                    {error}
                  </span>
                )}
              </div>
              <div className="closure-count__field" role="cell">
                <label className="sr-only" htmlFor={`note-${key}`}>
                  Observación de {item.productName}, {lotText.toLocaleLowerCase('es')}
                </label>
                <input
                  id={`note-${key}`}
                  className="ui-field__control"
                  autoComplete="off"
                  maxLength={CLOSURE_OBSERVATION_MAX_LENGTH}
                  placeholder="Opcional"
                  value={values[key]?.observation ?? ''}
                  onChange={(event) => update(key, 'observation', event.target.value)}
                  disabled={busy !== null}
                />
              </div>
            </div>
          )
        })}
      </div>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="closure-count__footer">
        <p className="closure-count__hint">
          Escribe 0 si no encontraste unidades de un lote. Puedes guardar y seguir contando más
          tarde.
        </p>
        <div className="closure-card__actions">
          <Button variant="outline" onClick={() => void save()} disabled={busy !== null}>
            {busy === 'save' ? 'Guardando...' : 'Guardar conteo'}
          </Button>
          {onConfirmed && (
            <Button onClick={requestConfirm} disabled={busy !== null}>
              Confirmar cierre
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        busy={busy === 'confirm'}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirm()}
      />
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDialog({ open, busy, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title="¿Confirmar el cierre del día?"
      description="Se guardan los conteos pendientes y el cierre queda bloqueado. Después de confirmar no se pueden cambiar las cantidades, y no se pueden registrar más movimientos en la sede hoy."
      onClose={busy ? () => undefined : onCancel}
    >
      <div className="closure-card__actions">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Seguir contando
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? 'Confirmando...' : 'Sí, confirmar cierre'}
        </Button>
      </div>
    </Modal>
  )
}
