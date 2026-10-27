import { useState } from 'react'

import { useAuth } from '../../hooks/useAuth'
import { ApiError } from '../../services/http'
import { inventoryClosuresService } from '../../services/inventoryClosures.service'
import type { InventoryClosure } from '../../types/inventoryClosure'
import { formatClosureDay, resolveClosureError } from '../../utils/inventoryClosures'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

import './InventoryClosures.css'

interface ClosureStartProps {
  branchId: string
  branchName: string
  today: string
  onStarted: (closure: InventoryClosure) => void
}

export function ClosureStart({ branchId, branchName, today, onStarted }: ClosureStartProps) {
  const { token } = useAuth()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      onStarted(await inventoryClosuresService.start(branchId, token))
    } catch (err) {
      const existingId =
        err instanceof ApiError && err.code === 'CLOSURE_ALREADY_EXISTS'
          ? (err.details as { closureId?: string } | undefined)?.closureId
          : undefined
      if (existingId) {
        try {
          onStarted(await inventoryClosuresService.get(existingId, token))
          return
        } catch (getError) {
          setError(resolveClosureError(getError, 'No fue posible abrir el cierre de hoy.'))
          return
        }
      }
      setError(resolveClosureError(err, 'No fue posible iniciar el cierre. Intenta de nuevo.'))
    } finally {
      setStarting(false)
    }
  }

  return (
    <section className="closure-card closure-start" aria-labelledby="closure-start-title">
      <p className="closure-card__eyebrow">{formatClosureDay(today)}</p>
      <h2 id="closure-start-title" className="closure-card__title">
        Cierre de inventario de {branchName}
      </h2>
      <p className="closure-card__text">
        Al iniciar, el sistema toma una foto de las existencias de cada lote y te pide contarlas. El
        conteo es ciego: no verás lo que dice el sistema hasta que el cierre se confirme.
      </p>
      <ol className="closure-start__steps">
        <li>Cuenta cada lote en el estante y escribe la cantidad.</li>
        <li>Guarda el conteo cuantas veces necesites mientras el cierre esté abierto.</li>
        <li>
          Confirma cuando todos los lotes estén contados. La confirmación no se puede deshacer.
        </li>
      </ol>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="closure-card__actions">
        <Button onClick={() => void start()} disabled={starting}>
          {starting ? 'Iniciando...' : 'Iniciar cierre del día'}
        </Button>
      </div>
    </section>
  )
}
