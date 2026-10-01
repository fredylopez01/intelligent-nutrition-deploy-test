import './BranchesTableSkeleton.css'

interface BranchesTableSkeletonProps {
  rows?: number
}

export function BranchesTableSkeleton({ rows = 6 }: BranchesTableSkeletonProps) {
  return (
    <div className="branches-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando sedes...</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="branches-skeleton__row" key={index} aria-hidden="true">
          <span className="branches-skeleton__line branches-skeleton__line--name" />
          <span className="branches-skeleton__line branches-skeleton__line--cell" />
          <span className="branches-skeleton__line branches-skeleton__line--cell" />
          <span className="branches-skeleton__line branches-skeleton__line--badge" />
        </div>
      ))}
    </div>
  )
}
