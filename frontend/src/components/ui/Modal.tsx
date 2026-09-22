import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

import './Modal.css'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ open, title, description, onClose, children }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])
  if (!open) return null

  return (
    <div className="ui-modal">
      <button
        type="button"
        className="ui-modal__backdrop"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="ui-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="ui-modal__header">
          <div>
            <h2 id={titleId} className="ui-modal__title">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="ui-modal__description">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="ui-modal__close"
            onClick={onClose}
            aria-label="Cerrar diálogo"
          >
            ×
          </button>
        </header>
        <div className="ui-modal__body">{children}</div>
      </div>
    </div>
  )
}
