import './TableSkeleton.css'

interface TableSkeletonProps {
  label: string
  rows?: number
  columns?: number
}

export function TableSkeleton({ label, rows = 6, columns = 3 }: TableSkeletonProps) {
  return (
    <div className="ui-table-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="ui-table-skeleton__row"
          key={row}
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${columns - 1}, minmax(0, 1fr)) 84px` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <span
              key={column}
              className={`ui-table-skeleton__line${column === columns - 1 ? ' ui-table-skeleton__line--badge' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
