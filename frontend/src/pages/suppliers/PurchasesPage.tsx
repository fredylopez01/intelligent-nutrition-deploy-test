import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PurchaseDetail } from '../../components/purchases/PurchaseDetail'
import { PurchaseForm } from '../../components/purchases/PurchaseForm'
import { PurchasesTable } from '../../components/purchases/PurchasesTable'
import { ReceiptForm } from '../../components/purchases/ReceiptForm'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { Pagination } from '../../components/ui/Pagination'
import { ReloadButton } from '../../components/ui/ReloadButton'
import { SearchBar } from '../../components/ui/SearchBar'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAuth } from '../../hooks/useAuth'
import { usePagination } from '../../hooks/usePagination'
import { usePurchases } from '../../hooks/usePurchases'
import { useSupplierOptions } from '../../hooks/useSupplierOptions'
import { AppLayout } from '../../layouts/AppLayout'
import { purchasesService } from '../../services/purchases.service'
import type { Purchase, PurchaseStatus, PurchaseSummary } from '../../types/purchase'
import { hasRole } from '../../utils/categories'
import { formatPrice } from '../../utils/products'
import {
  PURCHASE_RECEIVE_ROLES,
  PURCHASE_STATUS_LABELS,
  resolvePurchaseError,
} from '../../utils/purchases'

import '../inventory/InventoryPage.css'
import '../inventory/MovementsPage.css'

const FILTER_DEFAULTS = { proveedor: 'todos', estado: 'todos', desde: '', hasta: '' }
const STATUS_OPTIONS: PurchaseStatus[] = ['PENDING_RECEIPT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED']
const LIMIT_OPTIONS = [20, 50, 100]

export function PurchasesPage() {
  const { user } = useAuth()
  const canReceive = hasRole(PURCHASE_RECEIVE_ROLES, user?.role.name)
  const supplierOptions = useSupplierOptions()
  const [, setSearchParams] = useSearchParams()
  const { search, filters, params, limitOptions, setPage, setLimit, applySearch, setFilter } =
    usePagination({ filters: FILTER_DEFAULTS, defaultLimit: 20, limitOptions: LIMIT_OPTIONS })
  const invalidRange = filters.desde !== '' && filters.hasta !== '' && filters.desde > filters.hasta
  const hasListFilters =
    search !== '' ||
    filters.proveedor !== 'todos' ||
    filters.estado !== 'todos' ||
    filters.desde !== '' ||
    filters.hasta !== ''

  const { status, purchases, meta, error, refetch } = usePurchases(
    {
      ...params,
      supplierId: filters.proveedor === 'todos' ? undefined : filters.proveedor,
      status: filters.estado === 'todos' ? undefined : (filters.estado as PurchaseStatus),
      from: filters.desde || undefined,
      to: filters.hasta || undefined,
    },
    !invalidRange,
  )

  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<PurchaseSummary | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSearch = (term: string) => {
    if (term === search) refetch()
    else applySearch(term)
  }

  const clearFilters = () =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        for (const key of ['q', 'proveedor', 'estado', 'desde', 'hasta', 'pagina']) next.delete(key)
        return next
      },
      { replace: true },
    )

  const handleCreated = (purchase: Purchase) => {
    setCreating(false)
    setFeedback(
      `Orden ${purchase.purchaseNumber} registrada por ${formatPrice(purchase.total)}. El stock entra cuando se reciba la mercancía.`,
    )
    if (params.page === 1) refetch()
    else setPage(1)
  }

  const handleReceived = (purchase: Purchase) => {
    setViewing(null)
    setFeedback(
      purchase.status === 'FULLY_RECEIVED'
        ? `La compra ${purchase.purchaseNumber} quedó recibida completa y sus unidades entraron al stock general.`
        : `Recepción registrada: la compra ${purchase.purchaseNumber} sigue pendiente de las unidades que faltan.`,
    )
    refetch()
  }

  const renderList = () => {
    if (invalidRange) {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="info">La fecha inicial debe ser anterior o igual a la fecha final.</Alert>
        </div>
      )
    }
    if (status === 'loading' || status === 'idle') {
      return <TableSkeleton label="Cargando compras..." rows={8} columns={4} />
    }
    if (status === 'error') {
      return (
        <div className="inventory-page__feedback inventory-page__feedback--inset">
          <Alert tone="error">{error}</Alert>
          <Button variant="outline" onClick={refetch}>
            Reintentar
          </Button>
        </div>
      )
    }
    if (purchases.length === 0) {
      return hasListFilters ? (
        <EmptyState
          variant="sin-resultados"
          title="Ninguna compra coincide con los filtros"
          description="Revisa el número, el proveedor, el estado o las fechas."
          onClearFilters={clearFilters}
        />
      ) : (
        <EmptyState
          variant="sin-registros"
          title="Todavía no hay órdenes de compra"
          description="Las órdenes registran lo que se pide a cada proveedor. El stock general sube cuando se recibe la mercancía."
        >
          <Button onClick={() => setCreating(true)}>Registrar orden de compra</Button>
        </EmptyState>
      )
    }
    return <PurchasesTable purchases={purchases} onView={setViewing} />
  }

  return (
    <AppLayout title="Compras y recepción">
      <div className="inventory-page__toolbar">
        <SearchBar
          id="purchases-search"
          label="Buscar por número de compra"
          placeholder="Buscar por número, ej. C-20261026"
          value={search}
          onSearch={handleSearch}
        />
        <Button
          className="inventory-page__primary"
          onClick={() => {
            setFeedback(null)
            setCreating(true)
          }}
          disabled={supplierOptions.status === 'loading'}
        >
          Registrar orden de compra
        </Button>
      </div>
      <div className="inventory-page__toolbar movements-page__filters">
        <label className="sr-only" htmlFor="purchases-supplier-filter">
          Filtrar por proveedor
        </label>
        <select
          id="purchases-supplier-filter"
          className="inventory-page__filter movements-page__product-filter"
          value={filters.proveedor}
          onChange={(event) => setFilter('proveedor', event.target.value)}
        >
          <option value="todos">Todos los proveedores</option>
          {supplierOptions.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.active ? supplier.name : `${supplier.name} (inactivo)`}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="purchases-status-filter">
          Filtrar por estado
        </label>
        <select
          id="purchases-status-filter"
          className="inventory-page__filter"
          value={filters.estado}
          onChange={(event) => setFilter('estado', event.target.value)}
        >
          <option value="todos">Todos los estados</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {PURCHASE_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <div className="movements-page__dates">
          <label className="movements-page__date">
            <span>Desde</span>
            <input
              type="date"
              className="inventory-page__filter"
              value={filters.desde}
              onChange={(event) => setFilter('desde', event.target.value)}
            />
          </label>
          <label className="movements-page__date">
            <span>Hasta</span>
            <input
              type="date"
              className="inventory-page__filter"
              value={filters.hasta}
              onChange={(event) => setFilter('hasta', event.target.value)}
            />
          </label>
        </div>
        <ReloadButton onReload={refetch} loading={status === 'loading'} />
      </div>

      {feedback && (
        <div className="inventory-page__feedback">
          <Alert tone="success">{feedback}</Alert>
        </div>
      )}

      <div className="inventory-page__card">{renderList()}</div>

      <div className="inventory-page__footer">
        {status === 'success' && meta && (
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            limit={params.limit}
            limitOptions={limitOptions}
            label="Paginación de compras"
            onChange={setPage}
            onLimitChange={setLimit}
          />
        )}
      </div>

      <Modal
        open={creating}
        title="Registrar orden de compra"
        description="El backend calcula subtotales y total con las cantidades y costos de cada línea."
        size="wide"
        onClose={() => setCreating(false)}
      >
        {creating && (
          <PurchaseForm
            suppliers={supplierOptions.suppliers}
            onCreated={handleCreated}
            onCancel={() => setCreating(false)}
          />
        )}
      </Modal>

      <Modal
        open={viewing !== null}
        title={viewing ? `Compra ${viewing.purchaseNumber}` : 'Compra'}
        size="wide"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <PurchaseDialog
            summary={viewing}
            canReceive={canReceive}
            onReceived={handleReceived}
            onClose={() => setViewing(null)}
          />
        )}
      </Modal>
    </AppLayout>
  )
}

interface PurchaseDialogProps {
  summary: PurchaseSummary
  canReceive: boolean
  onReceived: (purchase: Purchase) => void
  onClose: () => void
}

function PurchaseDialog({ summary, canReceive, onReceived, onClose }: PurchaseDialogProps) {
  const { token } = useAuth()
  const [result, setResult] = useState<{ purchase: Purchase | null; error: string | null } | null>(
    null,
  )
  const [receiving, setReceiving] = useState(false)

  useEffect(() => {
    let cancelled = false
    purchasesService
      .get(summary.id, token)
      .then((purchase) => {
        if (!cancelled) setResult({ purchase, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setResult({
          purchase: null,
          error: resolvePurchaseError(error, 'No fue posible cargar la compra. Intenta de nuevo.'),
        })
      })
    return () => {
      cancelled = true
    }
  }, [summary.id, token])

  if (!result) {
    return (
      <p className="purchase-dialog__loading" role="status">
        Cargando la compra {summary.purchaseNumber}...
      </p>
    )
  }
  if (result.error || !result.purchase) return <Alert tone="error">{result.error}</Alert>
  if (receiving) {
    return (
      <ReceiptForm
        purchase={result.purchase}
        onReceived={onReceived}
        onCancel={() => setReceiving(false)}
      />
    )
  }
  return (
    <div className="sale-detail">
      <PurchaseDetail purchase={result.purchase} />
      {!canReceive && result.purchase.status !== 'FULLY_RECEIVED' && (
        <p className="sale-detail__meta">
          La recepción la confirma el superadmin, porque las unidades entran al stock general.
        </p>
      )}
      <div className="sale-detail__actions">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        {canReceive && result.purchase.status !== 'FULLY_RECEIVED' && (
          <Button onClick={() => setReceiving(true)}>Registrar recepción</Button>
        )}
      </div>
    </div>
  )
}
