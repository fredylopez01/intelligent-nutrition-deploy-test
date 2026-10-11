import '../users/UsersTableSkeleton.css'

interface CustomersTableSkeletonProps {
  rows?: number
}

export function CustomersTableSkeleton({ rows = 6 }: CustomersTableSkeletonProps) {
  return (
    <div className="users-skeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando clientes...</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="users-skeleton__row" key={index} aria-hidden="true">
          <span className="users-skeleton__avatar" />
          <span className="users-skeleton__lines">
            <span className="users-skeleton__line users-skeleton__line--name" />
            <span className="users-skeleton__line users-skeleton__line--email" />
          </span>
          <span className="users-skeleton__line users-skeleton__line--cell" />
          <span className="users-skeleton__line users-skeleton__line--badge" />
        </div>
      ))}
    </div>
  )
}
