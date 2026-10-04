import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import './Tabs.css'

export interface TabItem {
  id: string
  label: string
  icon?: ReactNode
}

interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  idPrefix: string
  label: string
}

export function Tabs({ items, activeId, onChange, idPrefix, label }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1
    const target =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (target === null) return
    event.preventDefault()
    onChange(items[target].id)
    refs.current[target]?.focus()
  }

  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.id === activeId
        return (
          <button
            key={item.id}
            ref={(element) => {
              refs.current[index] = element
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={`ui-tabs__tab${selected ? ' ui-tabs__tab--active' : ''}`}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {item.icon && (
              <span className="ui-tabs__icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
