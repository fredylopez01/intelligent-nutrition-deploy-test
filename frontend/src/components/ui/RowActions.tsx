import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './RowActions.css'

export interface RowAction {
  label: string
  onSelect: () => void
  tone?: 'danger'
}

interface RowActionsProps {
  label: string
  actions: RowAction[]
}

interface MenuPosition {
  top: number
  left: number
}

const MENU_WIDTH = 160

export function RowActions({ label, actions }: RowActionsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPosition({ top: rect.bottom + 4, left: rect.right - MENU_WIDTH })
    setIsOpen(true)
  }

  const closeMenu = (restoreFocus: boolean) => {
    setIsOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!isOpen) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setIsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      )
      if (items.length === 0) return
      event.preventDefault()
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(current + step + items.length) % items.length].focus()
    }
    const handleReposition = () => setIsOpen(false)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleReposition, true)
    window.addEventListener('resize', handleReposition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleReposition, true)
      window.removeEventListener('resize', handleReposition)
    }
  }, [isOpen])

  return (
    <div className="ui-row-actions">
      <button
        ref={triggerRef}
        type="button"
        className="ui-row-actions__trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={label}
        onClick={() => (isOpen ? closeMenu(false) : openMenu())}
      >
        ⋮
      </button>

      {isOpen &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className="ui-row-actions__menu"
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left, minWidth: MENU_WIDTH }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={`ui-row-actions__item${action.tone === 'danger' ? ' ui-row-actions__item--danger' : ''}`}
                onClick={() => {
                  closeMenu(false)
                  action.onSelect()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
