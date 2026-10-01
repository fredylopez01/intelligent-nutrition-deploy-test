import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import './UserMenu.css'

const PANEL_WIDTH = 220
const PANEL_GAP = 8

interface PanelPosition {
  top: number
  left: number
  width: number
}

// Fixed positioning escapes the sidebar's overflow clipping; falls back below the trigger when the right side has no room.
function getPanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect()
  const fitsRight = rect.right + PANEL_GAP + PANEL_WIDTH <= window.innerWidth
  if (fitsRight) {
    return { top: rect.top, left: rect.right + PANEL_GAP, width: PANEL_WIDTH }
  }
  return { top: rect.bottom + PANEL_GAP, left: rect.left, width: rect.width }
}

function ProfileIcon() {
  return (
    <svg
      className="user-menu__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg
      className="user-menu__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}

interface UserMenuProps {
  triggerClassName: string
  children: ReactNode
}

export function UserMenu({ triggerClassName, children }: UserMenuProps) {
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const panelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      close()
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const close = () => setPosition(null)
  const toggle = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    setPosition((current) => (current ? null : getPanelPosition(trigger)))
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }

  return (
    <div ref={containerRef} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={`user-menu__trigger ${triggerClassName}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        {children}
      </button>

      {position && (
        <nav
          id={panelId}
          className="user-menu__panel"
          style={{ top: position.top, left: position.left, width: position.width }}
          aria-label="Menú de usuario"
        >
          <Link to="/perfil" className="user-menu__item" onClick={close}>
            <ProfileIcon />
            Mi perfil
          </Link>
          <Link to="/configuracion" className="user-menu__item" onClick={close}>
            <SettingsIcon />
            Configuración
          </Link>
        </nav>
      )}
    </div>
  )
}
