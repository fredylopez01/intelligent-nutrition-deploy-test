import type { ReactNode } from 'react'

import { Button } from './Button'

import './EmptyState.css'

export type EmptyStateVariant = 'sin-registros' | 'sin-resultados'

interface EmptyStateProps {
  title: string
  description?: string
  eyebrow?: string
  variant?: EmptyStateVariant
  onClearFilters?: () => void
  children?: ReactNode
}

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function VariantIcon({ variant }: { variant: EmptyStateVariant }) {
  return (
    <span className={`ui-empty__icon ui-empty__icon--${variant}`} aria-hidden="true">
      {variant === 'sin-resultados' ? (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2M8.5 11h5" />
        </svg>
      ) : (
        <svg {...iconProps}>
          <path d="M4 13.5 6.5 6h11l2.5 7.5" />
          <path d="M4 13.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4.5h-4.5a3.5 3.5 0 0 1-7 0z" />
        </svg>
      )}
    </span>
  )
}

export function EmptyState({
  title,
  description,
  eyebrow,
  variant,
  onClearFilters,
  children,
}: EmptyStateProps) {
  const showClear = variant === 'sin-resultados' && onClearFilters !== undefined
  return (
    <div className="ui-empty">
      {variant && <VariantIcon variant={variant} />}
      {eyebrow && <p className="ui-empty__eyebrow">{eyebrow}</p>}
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__description">{description}</p>}
      {(showClear || children) && (
        <div className="ui-empty__actions">
          {showClear && (
            <Button variant="outline" onClick={onClearFilters}>
              Limpiar filtros
            </Button>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
