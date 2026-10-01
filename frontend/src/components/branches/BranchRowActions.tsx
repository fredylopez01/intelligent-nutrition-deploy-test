import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './BranchRowActions.css'

interface BranchRowActionsProps {
  branchName: string
  onEdit: () => void
}

interface MenuPosition {
  top: number
  left: number
}

export function BranchRowActions({ branchName, onEdit }: BranchRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setPosition({ top: rect.bottom + 4, left: rect.right - 160 })
    }
    setIsOpen(true)
  }

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setIsOpen(false)
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    const handleReposition = () => setIsOpen(false)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen])

  return (
    <div className="branch-row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="branch-row-actions__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Acciones para ${branchName}`}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
      >
        ⋮
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className="branch-row-actions__menu"
            role="menu"
            style={{ top: position.top, left: position.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="branch-row-actions__item"
              onClick={() => {
                setIsOpen(false)
                onEdit()
              }}
            >
              Editar
            </button>
            <button
              type="button"
              role="menuitem"
              className="branch-row-actions__item"
              disabled
              aria-describedby="branch-row-actions-deactivate-hint"
            >
              Desactivar
            </button>
            <p className="branch-row-actions__hint" id="branch-row-actions-deactivate-hint">
              Próximamente
            </p>
          </div>,
          document.body,
        )}
    </div>
  )
}
