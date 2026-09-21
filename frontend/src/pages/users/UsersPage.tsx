import { useMemo, useState } from 'react'

import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { CreateUserForm } from '../../components/users/CreateUserForm'
import { UserDetailPanel } from '../../components/users/UserDetailPanel'
import { UsersTable } from '../../components/users/UsersTable'
import { UsersTableSkeleton } from '../../components/users/UsersTableSkeleton'
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

export function UsersPage() {
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('todos')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('todos')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createdMessage, setCreatedMessage] = useState<string | null>(null)
  const { status, users, meta, emptyMessage, error, refetch } = useUsers({
    page,
    limit: PAGE_SIZE,
    active: ACTIVE_FILTER_VALUES[activeFilter],
  })

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId],
  )
  const roleOptions = useMemo(() => {
    const names = new Set(users.map((user) => user.role.name))
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'))
  }, [users])
  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return users.filter((user) => {
      const matchesRole = roleFilter === 'todos' || user.role.name === roleFilter
      const matchesTerm =
        term === '' ||
        user.fullName.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term)
      return matchesRole && matchesTerm
    })
  }, [users, search, roleFilter])
  const totalPages = meta?.totalPages ?? 0
  const hasFilters = search.trim() !== '' || roleFilter !== 'todos'
  const handleOpenCreate = () => {
    setCreatedMessage(null)
    setIsCreateOpen(true)
  }

  const handleUserCreated = () => {
    setIsCreateOpen(false)
    setCreatedMessage('El usuario quedó registrado. Le enviamos el correo de activación.')
    if (page === 1) {
      void refetch()
    } else {
      setPage(1)
    }
  }

  const handleUserUpdated = () => {
    void refetch()
  }

  const renderList = () => {
    if (status === 'loading') return <UsersTableSkeleton rows={PAGE_SIZE} />
    if (status === 'error') {
      return (
        <div className="users-page__feedback">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (users.length === 0) {
      return (
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

    if (visibleUsers.length === 0) {
      return (
        <EmptyState
          title="Ningún usuario coincide con la búsqueda"
          description="Revisa el nombre, el correo o cambia el filtro de rol."
        />
      )
    }

    return (
      <UsersTable
        users={visibleUsers}
        selectedUserId={selectedUserId}
        onSelect={(user) => {
          setCreatedMessage(null)
          setSelectedUserId(user.id)
        }}
      />
    )
  }

  return (
    <AppLayout
      title="Usuarios"
      aside={<UserDetailPanel user={selectedUser} onUpdated={handleUserUpdated} />}
    >
      <div className="users-page__toolbar">
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
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="todos">Todos los roles</option>
          {roleOptions.map((name) => (
            <option key={name} value={name}>
              {getRoleLabel(name)}
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
          onChange={(event) => {
            setActiveFilter(event.target.value as ActiveFilter)
            setPage(1)
          }}
        >
          <option value="todos">Todos los estados</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
        <Button onClick={handleOpenCreate}>Registrar usuario</Button>
      </div>
      {createdMessage && (
        <div className="users-page__feedback">
          <Alert tone="success">{createdMessage}</Alert>
        </div>
      )}
      <div className="users-page__card">{renderList()}</div>
      <div className="users-page__footer">
        <p className="users-page__hint">
          Un usuario desactivado no puede ingresar, y su historial se conserva para auditoría.
        </p>
        {status === 'success' && totalPages > 1 && !hasFilters && (
          <nav className="users-page__pagination" aria-label="Paginación de usuarios">
            <Button variant="outline" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              Anterior
            </Button>
            <span className="users-page__page-info">
              Página {meta?.page ?? page} de {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
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
    </AppLayout>
  )
}
