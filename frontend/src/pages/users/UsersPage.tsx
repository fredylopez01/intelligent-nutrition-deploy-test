import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { AssignUserBranchForm } from '../../components/users/AssignUserBranchForm'
import { CreateUserForm } from '../../components/users/CreateUserForm'
import { UsersTable } from '../../components/users/UsersTable'
import { UsersTableSkeleton } from '../../components/users/UsersTableSkeleton'
import { useRoles } from '../../hooks/useRoles'
import { useUsers } from '../../hooks/useUsers'
import { AppLayout } from '../../layouts/AppLayout'
import { getRoleLabel } from '../../utils/format'

import './UsersPage.css'

const PAGE_SIZE = 10

type ActiveFilter = 'todos' | 'activos' | 'inactivos'

const ACTIVE_FILTER_VALUES: Record<ActiveFilter, boolean | undefined> = {
  todos: undefined,
  activos: true,
  inactivos: false,
}

function parseActiveFilter(value: string | null): ActiveFilter {
  return value === 'activos' || value === 'inactivos' ? value : 'todos'
}

export function UsersPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const page = Math.max(1, Number(searchParams.get('pagina')) || 1)
  const roleFilter = searchParams.get('rol') ?? 'todos'
  const activeFilter = parseActiveFilter(searchParams.get('estado'))
  const urlSearch = searchParams.get('q') ?? ''

  const [search, setSearch] = useState(urlSearch)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isAssignOpen, setIsAssignOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)

  const { roles } = useRoles()

  const updateParams = (changes: Record<string, string | null>, resetPage = true) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '' || value === 'todos') next.delete(key)
          else next.set(key, value)
        }
        if (resetPage) next.delete('pagina')
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const term = search.trim()
      if (term === urlSearch) return
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (term) next.set('q', term)
          else next.delete('q')
          next.delete('pagina')
          return next
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [search, urlSearch, setSearchParams])

  const { status, users, meta, emptyMessage, error, refetch } = useUsers({
    page,
    limit: PAGE_SIZE,
    active: ACTIVE_FILTER_VALUES[activeFilter],
    search: urlSearch || undefined,
    roleId: roleFilter === 'todos' ? undefined : roleFilter,
  })

  const totalPages = meta?.totalPages ?? 0
  const hasFilters = urlSearch !== '' || roleFilter !== 'todos' || activeFilter !== 'todos'
  const returnTo = `${location.pathname}${location.search}`

  const goToPage = (nextPage: number) => {
    updateParams({ pagina: nextPage > 1 ? String(nextPage) : null }, false)
  }

  const clearFilters = () => {
    setSearch('')
    updateParams({ q: null, rol: null, estado: null })
  }

  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleUserCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('El usuario quedó registrado. Le enviamos el correo de activación.')
    if (page === 1) refetch()
    else goToPage(1)
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
          <label className="sr-only" htmlFor="users-search">
            Buscar por nombre o correo
          </label>
          <input
            id="users-search"
            type="search"
            className="users-page__search"
            placeholder="Buscar por nombre o correo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <label className="sr-only" htmlFor="users-role-filter">
            Filtrar por rol
          </label>
          <select
            id="users-role-filter"
            className="users-page__filter"
            value={roleFilter}
            onChange={(event) => updateParams({ rol: event.target.value })}
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
            value={activeFilter}
            onChange={(event) => updateParams({ estado: event.target.value })}
          >
            <option value="todos">Todos los estados</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
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

        {status === 'success' && totalPages > 1 && (
          <nav className="users-page__pagination" aria-label="Paginación de usuarios">
            <Button variant="outline" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
              Anterior
            </Button>
            <span className="users-page__page-info">
              Página {meta?.page ?? page} de {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Siguiente
            </Button>
          </nav>
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
