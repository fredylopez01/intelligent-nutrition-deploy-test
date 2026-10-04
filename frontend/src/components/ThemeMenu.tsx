import { useEffect, useId, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent } from 'react'

import { useTheme } from '../hooks/useTheme'
import type { ThemePreference } from '../types/theme'

import './ThemeMenu.css'

const MENU_WIDTH = 196
const MENU_GAP = 8
const VIEWPORT_MARGIN = 8

interface MenuPosition {
  top: number
  left: number
}

function getMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect()
  const left = Math.min(
    Math.max(rect.right - MENU_WIDTH, VIEWPORT_MARGIN),
    window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
  )
  return { top: rect.bottom + MENU_GAP, left }
}

function ThemeIcon({ variant }: { variant: ThemePreference }) {
  return (
    <svg
      className="theme-menu__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {variant === 'light' && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </>
      )}
      {variant === 'dark' && (
        <>
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          <path d="M17 3v3M15.5 4.5h3" />
        </>
      )}
      {variant === 'system' && (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M9 20h6M12 16v4" />
        </>
      )}
    </svg>
  )
}

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
]

export function ThemeMenu() {
  const { preference, theme, setPreference } = useTheme()
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const menuId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const open = position !== null

  useEffect(() => {
    if (!open) return
    const checkedIndex = OPTIONS.findIndex((option) => option.value === preference)
    itemRefs.current[checkedIndex]?.focus()
  }, [open, preference])

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const close = () => setPosition(null)
  const toggle = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    setPosition((current) => (current ? null : getMenuPosition(trigger)))
  }
  const pick = (value: ThemePreference) => {
    setPreference(value)
    close()
    triggerRef.current?.focus()
  }
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }
  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      triggerRef.current?.focus()
      return
    }

    const items = itemRefs.current
    const current = items.findIndex((item) => item === document.activeElement)
    const last = OPTIONS.length - 1
    let next: number | null = null
    if (event.key === 'ArrowDown') next = current >= last ? 0 : current + 1
    if (event.key === 'ArrowUp') next = current <= 0 ? last : current - 1
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    if (next === null) return

    event.preventDefault()
    items[next]?.focus()
  }

  return (
    <div ref={containerRef} className="theme-menu" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-menu__trigger"
        aria-label="Cambiar tema"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <ThemeIcon variant={theme} />
      </button>

      {position && (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label="Tema"
          className="theme-menu__panel"
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          onKeyDown={handleMenuKeyDown}
        >
          {OPTIONS.map((option, index) => {
            const checked = option.value === preference
            return (
              <button
                key={option.value}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={`theme-menu__option${checked ? ' theme-menu__option--checked' : ''}`}
                onClick={() => pick(option.value)}
              >
                <ThemeIcon variant={option.value} />
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
