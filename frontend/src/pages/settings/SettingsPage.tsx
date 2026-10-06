import { useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import { ChangePasswordForm } from '../../components/settings/ChangePasswordForm'
import { EmptyState } from '../../components/ui/EmptyState'
import { AppLayout } from '../../layouts/AppLayout'

import './SettingsPage.css'

type SettingsTab = 'cuenta' | 'seguridad'

function AccountIcon() {
  return (
    <svg
      className="settings-page__tab-icon"
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

function LockIcon() {
  return (
    <svg
      className="settings-page__tab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  )
}

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'cuenta', label: 'Cuenta', icon: <AccountIcon /> },
  { id: 'seguridad', label: 'Seguridad', icon: <LockIcon /> },
]

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('cuenta')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const baseId = useId()

  const selectTabAt = (index: number) => {
    const tab = TABS[index]
    setActiveTab(tab.id)
    tabRefs.current[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab)
    const lastIndex = TABS.length - 1
    const nextIndexByKey: Record<string, number> = {
      ArrowRight: currentIndex === lastIndex ? 0 : currentIndex + 1,
      ArrowLeft: currentIndex === 0 ? lastIndex : currentIndex - 1,
      Home: 0,
      End: lastIndex,
    }
    const nextIndex = nextIndexByKey[event.key]
    if (nextIndex === undefined) return
    event.preventDefault()
    selectTabAt(nextIndex)
  }

  return (
    <AppLayout title="Configuración">
      <div className="settings-page">
        <div className="settings-page__tabs" role="tablist" aria-label="Secciones de configuración">
          {TABS.map((tab, index) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`${baseId}-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={`settings-page__tab${isActive ? ' settings-page__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleKeyDown}
              >
                {tab.icon}
                {tab.label}
              </button>
            )
          })}
        </div>

        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeTab}`}
          aria-labelledby={`${baseId}-tab-${activeTab}`}
          className="settings-page__panel"
        >
          {activeTab === 'cuenta' ? (
            <EmptyState
              eyebrow="Coming next"
              title="Los datos de tu cuenta llegan en un próximo sprint"
            />
          ) : (
            <ChangePasswordForm />
          )}
        </div>
      </div>
    </AppLayout>
  )
}
