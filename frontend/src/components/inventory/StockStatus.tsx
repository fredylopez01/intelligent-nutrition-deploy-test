import './StockStatus.css'

interface StockStatusProps {
  totalQuantity: number
  lowStock?: boolean
}

export function StockStatus({ totalQuantity, lowStock }: StockStatusProps) {
  if (totalQuantity === 0) {
    return <span className="stock-status stock-status--empty">Agotado</span>
  }
  if (lowStock === true) {
    return <span className="stock-status stock-status--low">Bajo mínimo</span>
  }
  return (
    <span className="stock-status stock-status--ok">
      {lowStock === false ? 'En nivel' : 'Disponible'}
    </span>
  )
}
