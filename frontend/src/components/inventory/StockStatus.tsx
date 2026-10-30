import { useId, useState } from 'react'

import './StockStatus.css'

interface StockStatusProps {
  totalQuantity: number
  lowStock?: boolean
}

export const LOW_STOCK_TOOLTIP =
  'Alerta de stock bajo: la cantidad disponible está por debajo del mínimo configurado.'

export function StockStatus({ totalQuantity, lowStock }: StockStatusProps) {
  const tooltipId = useId()
  const [tooltipOpen, setTooltipOpen] = useState(false)

  if (totalQuantity === 0) {
    return <span className="stock-status stock-status--empty">Agotado</span>
  }
  if (lowStock === true) {
    return (
      <span className="stock-status stock-status--low">
        <button
          type="button"
          className="stock-status__warning"
          aria-label="Advertencia de stock bajo"
          aria-describedby={tooltipOpen ? tooltipId : undefined}
          onMouseEnter={() => setTooltipOpen(true)}
          onMouseLeave={() => setTooltipOpen(false)}
          onFocus={() => setTooltipOpen(true)}
          onBlur={() => setTooltipOpen(false)}
        >
          <span aria-hidden="true">⚠</span>
          {tooltipOpen && (
            <span id={tooltipId} role="tooltip" className="stock-status__tooltip">
              {LOW_STOCK_TOOLTIP}
            </span>
          )}
        </button>
        Bajo mínimo
      </span>
    )
  }
  return (
    <span className="stock-status stock-status--ok">
      {lowStock === false ? 'En nivel' : 'Disponible'}
    </span>
  )
}
