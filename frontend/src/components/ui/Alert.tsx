import type { ReactNode } from 'react'

import './Alert.css'

type AlertTone = 'success' | 'error' | 'info'

interface AlertProps {
  tone: AlertTone
  children: ReactNode
}

export function Alert({ tone, children }: AlertProps) {
  return (
    <div
      className={`ui-alert ui-alert--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      {children}
    </div>
  )
}
