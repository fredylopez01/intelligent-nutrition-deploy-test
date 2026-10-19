import { useId } from 'react'

import { getPageItems } from '../../utils/pagination'

import './Pagination.css'

interface PaginationProps {
  page: number
  totalPages: number
  label: string
  onChange: (page: number) => void
  total?: number
  limit?: number
  limitOptions?: number[]
  onLimitChange?: (limit: number) => void
}

export function Pagination({
  page,
  totalPages,
  label,
  onChange,
  total,
  limit,
  limitOptions,
  onLimitChange,
}: PaginationProps) {
  const limitId = useId()
  const canChangeLimit =
    onLimitChange !== undefined &&
    limit !== undefined &&
    limitOptions !== undefined &&
    limitOptions.length > 1 &&
    total !== undefined &&
    total > Math.min(...limitOptions)

  if (totalPages <= 1 && !canChangeLimit) return null

  const hasSummary = total !== undefined && limit !== undefined && total > 0
  const firstItem = hasSummary ? (page - 1) * limit + 1 : 0
  const lastItem = hasSummary ? Math.min(page * limit, total) : 0

  return (
    <nav className="ui-pagination" aria-label={label}>
      {hasSummary && (
        <p className="ui-pagination__summary" aria-live="polite">
          Mostrando {firstItem}–{lastItem} de {total}
        </p>
      )}

      {totalPages > 1 && (
        <div className="ui-pagination__controls">
          <button
            type="button"
            className="ui-pagination__step"
            aria-label="Página anterior"
            onClick={() => onChange(page - 1)}
            disabled={page <= 1}
          >
            <span aria-hidden="true">‹</span>
            <span className="ui-pagination__step-text">Anterior</span>
          </button>

          <ol className="ui-pagination__pages">
            {getPageItems(page, totalPages).map((item) =>
              typeof item === 'number' ? (
                <li key={item}>
                  <button
                    type="button"
                    className={`ui-pagination__page${item === page ? ' ui-pagination__page--current' : ''}`}
                    aria-label={`Página ${item} de ${totalPages}`}
                    aria-current={item === page ? 'page' : undefined}
                    onClick={() => {
                      if (item !== page) onChange(item)
                    }}
                  >
                    {item}
                  </button>
                </li>
              ) : (
                <li key={item} className="ui-pagination__gap" aria-hidden="true">
                  …
                </li>
              ),
            )}
          </ol>

          <button
            type="button"
            className="ui-pagination__step"
            aria-label="Página siguiente"
            onClick={() => onChange(page + 1)}
            disabled={page >= totalPages}
          >
            <span className="ui-pagination__step-text">Siguiente</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}

      {canChangeLimit && (
        <div className="ui-pagination__limit">
          <label htmlFor={limitId}>Filas por página</label>
          <select
            id={limitId}
            className="ui-pagination__select"
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
          >
            {limitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}
    </nav>
  )
}
