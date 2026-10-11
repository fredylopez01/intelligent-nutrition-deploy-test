import { Button } from './Button'

import './Pagination.css'

interface PaginationProps {
  page: number
  totalPages: number
  label: string
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, label, onChange }: PaginationProps) {
  if (totalPages <= 1) return null

  return (
    <nav className="ui-pagination" aria-label={label}>
      <Button variant="outline" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        Anterior
      </Button>
      <span className="ui-pagination__info">
        Página {page} de {totalPages}
      </span>
      <Button variant="outline" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Siguiente
      </Button>
    </nav>
  )
}
