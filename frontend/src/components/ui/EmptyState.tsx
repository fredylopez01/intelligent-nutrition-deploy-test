import type { ReactNode } from 'react'

import './EmptyState.css'

interface EmptyStateProps {
  title: string
  description?: string
  eyebrow?: string
  children?: ReactNode
}

export function EmptyState({ title, description, eyebrow, children }: EmptyStateProps) {
  return (
    <div className="ui-empty">
      {eyebrow && <p className="ui-empty__eyebrow">{eyebrow}</p>}
      <p className="ui-empty__title">{title}</p>
      {description && <p className="ui-empty__description">{description}</p>}
      {children && <div className="ui-empty__actions">{children}</div>}
    </div>
  )
}
