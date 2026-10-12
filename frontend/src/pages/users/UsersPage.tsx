import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { AssignUserBranchForm } from '../../components/users/AssignUserBranchForm'
import { CreateUserForm } from '../../components/users/CreateUserForm'
import { UsersTable } from '../../components/users/UsersTable'
import { UsersTableSkeleton } from '../../components/users/UsersTableSkeleton'
import { usePagination } from '../../hooks/usePagination'
import { useRoles } from '../../hooks/useRoles'
import { useUsers } from '../../hooks/useUsers'
import { AppLayout } from '../../layouts/AppLayout'
import { getRoleLabel } from '../../utils/format'

import './UsersPage.css'

const PAGE_SIZE = 10

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activos: true,
  inactivos: false,
}

const FILTER_DEFAULTS = { rol: 'todos', estado: 'todos' }

export function UsersPage() {
  const location = useLocation()
  const { page, search, filters, hasFilters, setPage, applySearch, setFilter, clearFilters } =
    usePagination({ filters: FILTER_DEFAULTS })

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const { roles } = useRoles()

  const { status, users, meta, emptyMessage, error, refetch } = useUsers({
    page,
    limit: PAGE_SIZE,
    active: ACTIVE_FILTER_VALUES[filters.estado],
    search: search || undefined,
    roleId: filters.rol === 'todos' ? undefined : filters.rol,
  })

  const totalPages = meta?.totalPages ?? 0

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }
  const returnTo = `${location.pathname}${location.search}`

  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleUserCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('El usuario quedó registrado. Le enviamos el correo de activación.')
    if (page === 1) refetch()
    else setPage(1)
  }

  const renderList = () => {
    if (status === 'loading') return <UsersTableSkeleton rows={PAGE_SIZE} />

    if (status === 'error') {
      return (
        <div className="users-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (users.length === 0) {
      return hasFilters ? (
        <EmptyState
          title="Ningún usuario coincide con los filtros"
          description="Revisa el nombre o el correo, o quita los filtros de rol y estado."
        >
          <Button variant="outline" onClick={clearFilters}>
            Quitar filtros
          </Button>
        </EmptyState>
      ) : (
        <EmptyState
          title="Todavía no hay usuarios registrados"
          description={
            emptyMessage ?? 'Registra la primera cuenta para que el equipo pueda entrar.'
          }
        >
          <Button onClick={handleOpenCreate}>Registrar usuario</Button>
        </EmptyState>
      )
    }

    return <UsersTable users={users} returnTo={returnTo} />
  }

  return (
    <AppLayout title="Usuarios">
      <div className="users-page__toolbar">
        <div className="users-page__filters">
          <SearchBar
            id="users-search"
            label="Buscar por nombre o correo"
            placeholder="Buscar por nombre o correo"
            value={search}
            onSearch={handleSearch}
          />

          <label className="sr-only" htmlFor="users-role-filter">
            Filtrar por rol
          </label>
          <select
            id="users-role-filter"
            className="users-page__filter"
            value={filters.rol}
            onChange={(event) => setFilter('rol', event.target.value)}
          >
            <option value="todos">Todos los roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {getRoleLabel(role.name)}
              </option>
            ))}
          </select>

          <label className="sr-only" htmlFor="users-active-filter">
            Filtrar por estado
          </label>
          <select
            id="users-active-filter"
            className="users-page__filter"
            value={filters.estado}
            onChange={(event) => setFilter('estado', event.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>

          <ReloadButton onReload={refetch} loading={status === 'loading'} />
        </div>

        <div className="users-page__actions">
          <Button variant="outline" onClick={() => setIsAssignOpen(true)}>
            Asociar a sede
          </Button>
          <Button onClick={handleOpenCreate}>Registrar usuario</Button>
        </div>
      </div>

      {createdMessage && (
        <div className="users-page__feedback">
          <Alert tone="success">{createdMessage}</Alert>
        </div>
      )}

      <div className="users-page__card">{renderList()}</div>

      <div className="users-page__footer">
        <p className="users-page__hint">
          {meta && status === 'success' && meta.total > 0
            ? `${meta.total} ${meta.total === 1 ? 'usuario' : 'usuarios'}. Abre uno para ver y editar sus datos, rol y sedes.`
            : 'Un usuario desactivado no puede ingresar, y su historial se conserva para auditoría.'}
        </p>

        {status === 'success' && (
          <Pagination
            page={meta?.page ?? page}
            totalPages={totalPages}
            label="Paginación de usuarios"
            onChange={setPage}
          />
        )}
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar usuario"
        description="La cuenta se crea sin contraseña. El usuario la define desde el correo de activación."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateUserForm onCreated={handleUserCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        open={isAssignOpen}
        title="Asociar usuario a sede"
        description="Elige un usuario y una sede activa. Las asignaciones existentes se pueden desactivar desde aquí."
        onClose={() => setIsAssignOpen(false)}
      >
        <AssignUserBranchForm onAssigned={refetch} onClose={() => setIsAssignOpen(false)} />
      </Modal>
    </AppLayout>
  )
}
