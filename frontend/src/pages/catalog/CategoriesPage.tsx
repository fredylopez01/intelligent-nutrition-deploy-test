import { useState } from 'react'

import { CategoriesTable } from '../../components/categories/CategoriesTable'
import { CategoryStatusConfirmation } from '../../components/categories/CategoryStatusConfirmation'
import { CreateCategoryForm } from '../../components/categories/CreateCategoryForm'
import { EditCategoryForm } from '../../components/categories/EditCategoryForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { useCategories } from '../../hooks/useCategories'
import { usePagination } from '../../hooks/usePagination'
import { AppLayout } from '../../layouts/AppLayout'
import type { Category } from '../../types/category'
import { CATEGORY_MANAGE_ROLES, CATEGORY_STATUS_ROLES, hasRole } from '../../utils/categories'

import './CatalogPage.css'

const SKELETON_ROWS = 8

const ACTIVE_FILTER_VALUES: Record<string, boolean | undefined> = {
  activas: true,
  inactivas: false,
}

const FILTER_DEFAULTS = { estado: 'todos' }

export function CategoriesPage() {
  const { user } = useAuth()
  const roleName = user?.role.name
  const canManage = hasRole(CATEGORY_MANAGE_ROLES, roleName)
  const canChangeStatus = hasRole(CATEGORY_STATUS_ROLES, roleName)

  const {
    page,
    search,
    filters,
    hasFilters,
    params,
    limitOptions,
    setPage,
    setLimit,
    applySearch,
    setFilter,
    clearFilters,
  } = usePagination({ filters: FILTER_DEFAULTS })
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [statusCategory, setStatusCategory] = useState<Category | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const { status, categories, meta, error, refetch } = useCategories({
    ...params,
    active: ACTIVE_FILTER_VALUES[filters.estado],
  })

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const handleOpenCreate = () => {
    setFeedbackMessage(null)
    setIsCreateOpen(true)
  }

  const handleCreated = (category: Category) => {
    setIsCreateOpen(false)
    setFeedbackMessage(`La categoría ${category.name} quedó registrada y activa.`)
    if (page === 1) refetch()
    else setPage(1)
  }

  const handleUpdated = (category: Category) => {
    setEditingCategory(null)
    setFeedbackMessage(`Los cambios de la categoría ${category.name} se guardaron.`)
    refetch()
  }

  const handleStatusChanged = (category: Category) => {
    setStatusCategory(null)
    setFeedbackMessage(
      `La categoría ${category.name} ahora está ${category.active ? 'activa' : 'inactiva'}.`,
    )
    refetch()
  }

  const renderList = () => {
    if (status === 'loading')
      return <TableSkeleton label="Cargando categorías..." rows={SKELETON_ROWS} />

    if (status === 'error') {
      return (
        <div className="catalog-page__feedback catalog-page__feedback--inset">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }

    if (categories.length === 0) {
      return hasFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ninguna categoría coincide con los filtros"
          description="Revisa el nombre o cambia el filtro de estado."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay categorías registradas"
          description="Las categorías agrupan los productos del catálogo, por ejemplo Proteínas o Vitaminas."
        >
          {canManage && <Button onClick={handleOpenCreate}>Registrar categoría</Button>}
        </EmptyState>
      )
    }

    return (
      <CategoriesTable
        categories={categories}
        canEdit={canManage}
        canChangeStatus={canChangeStatus}
        onEdit={(category) => {
          setFeedbackMessage(null)
          setEditingCategory(category)
        }}
        onToggleStatus={(category) => {
          setFeedbackMessage(null)
          setStatusCategory(category)
        }}
      />
    )
  }

  return (
    <AppLayout title="Categorías">
      <div className="catalog-page__toolbar">
        <SearchBar
          id="categories-search"
          label="Buscar por nombre"
          placeholder="Buscar por nombre"
          value={search}
          onSearch={handleSearch}
        />
        <label className="sr-only" htmlFor="categories-active-filter">
          Filtrar por estado
        </label>
        <select
          id="categories-active-filter"
          className="catalog-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          <option value="activas">Activas</option>
          <option value="inactivas">Inactivas</option>
        </select>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
        {canManage && (
          <Button className="catalog-page__primary" onClick={handleOpenCreate}>
            Registrar categoría
          </Button>
        )}
      </div>

      {feedbackMessage && (
        <div className="catalog-page__feedback">
          <Alert tone="success">{feedbackMessage}</Alert>
        </div>
      )}

      <div className="catalog-page__card">{renderList()}</div>

      <div className="catalog-page__footer">
        {status === 'success' && meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de categorías"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
        <p className="catalog-page__note">
          Una categoría inactiva no se puede asignar a productos nuevos o editados, pero los
          productos que ya la usan la conservan y siguen en el catálogo.
        </p>
      </div>

      <Modal
        open={isCreateOpen}
        title="Registrar categoría"
        description="Agrupa los productos del catálogo. El nombre no puede repetirse."
        onClose={() => setIsCreateOpen(false)}
      >
        <CreateCategoryForm onCreated={handleCreated} onCancel={() => setIsCreateOpen(false)} />
      </Modal>

      <Modal
        open={editingCategory !== null}
        title="Editar categoría"
        onClose={() => setEditingCategory(null)}
      >
        {editingCategory && (
          <EditCategoryForm
            category={editingCategory}
            onUpdated={handleUpdated}
            onCancel={() => setEditingCategory(null)}
          />
        )}
      </Modal>

      <Modal
        open={statusCategory !== null}
        title={statusCategory?.active ? '¿Desactivar esta categoría?' : '¿Activar esta categoría?'}
        description={
          statusCategory?.active
            ? `${statusCategory.name} no se podrá asignar a productos nuevos o editados. Los productos que ya la usan la conservan y siguen en el catálogo.`
            : `${statusCategory?.name} volverá a estar disponible para asignarla a productos.`
        }
        onClose={() => setStatusCategory(null)}
      >
        {statusCategory && (
          <CategoryStatusConfirmation
            category={statusCategory}
            onChanged={handleStatusChanged}
            onCancel={() => setStatusCategory(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}
