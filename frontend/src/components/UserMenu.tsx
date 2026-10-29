import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import { getRoleLabel } from '../utils/format'

import { Avatar } from './ui/Avatar'

import './UserMenu.css'

const PANEL_WIDTH = 264
const PANEL_GAP = 8
const VIEWPORT_MARGIN = 8

interface PanelPosition {
  top: number
  left: number
}

function getPanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect()
  const left = Math.min(
    Math.max(rect.right - PANEL_WIDTH, VIEWPORT_MARGIN),
    window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN,
  )
  return { top: rect.bottom + PANEL_GAP, left }
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

function LogoutIcon() {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
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

  if (!user) return null

  const close = () => setPosition(null)
  const toggle = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    setPosition((current) => (current ? null : getPanelPosition(trigger)))
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }
  const handleLogout = () => {
    close()
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div ref={containerRef} className="user-menu" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu__trigger"
        aria-label={`Menú de usuario de ${user.fullName}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        <Avatar name={user.fullName} size="md" highlighted />
      </button>

      {position && (
        <div
          id={panelId}
          className="user-menu__panel"
          style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
        >
          <div className="user-menu__header">
            <Avatar name={user.fullName} size="md" highlighted />
            <div className="user-menu__identity">
              <p className="user-menu__name">{user.fullName}</p>
              <p className="user-menu__email">{user.email}</p>
              <p className="user-menu__role">{getRoleLabel(user.role.name)}</p>
            </div>
          </div>
          <nav className="user-menu__items" aria-label="Menú de usuario">
            <Link to="/perfil" className="user-menu__item" onClick={close}>
              <ProfileIcon />
              Mi perfil
            </Link>
            <Link to="/configuracion" className="user-menu__item" onClick={close}>
              <SettingsIcon />
              Configuración
            </Link>
          </nav>
          <button type="button" className="user-menu__logout" onClick={handleLogout}>
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
