import { Button } from './Button'

import './ReloadButton.css'

interface ReloadButtonProps {
  onReload: () => void
  loading: boolean
}

export function ReloadButton({ onReload, loading }: ReloadButtonProps) {
  return (
    <Button
      variant="outline"
      className={`ui-reload${loading ? ' ui-reload--loading' : ''}`}
      onClick={onReload}
      disabled={loading}
      aria-busy={loading}
    >
      <svg
        className="ui-reload__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </svg>
      {loading ? 'Cargando...' : 'Recargar'}
    </Button>
  )
}
