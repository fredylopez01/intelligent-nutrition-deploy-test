import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { ActivateAccountPage } from '../pages/activation/ActivateAccountPage'
import { AuditLogsPage } from '../pages/audit-logs/AuditLogsPage'
import { BranchesPage } from '../pages/branches/BranchesPage'
import { CategoriesPage } from '../pages/catalog/CategoriesPage'
import { ProductDetailPage } from '../pages/catalog/ProductDetailPage'
import { ProductsPage } from '../pages/catalog/ProductsPage'
import { UnitsPage } from '../pages/catalog/UnitsPage'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { CustomerDetailPage } from '../pages/customers/CustomerDetailPage'
import { CustomersPage } from '../pages/customers/CustomersPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { GoogleAuthCallbackPage } from '../pages/GoogleAuthCallbackPage'
import { ConsolidatedInventoryPage } from '../pages/inventory/ConsolidatedInventoryPage'
import { InventoryPage } from '../pages/inventory/InventoryPage'
import { LandingPage } from '../pages/LandingPage'
import { PrivacyPolicyPage } from '../pages/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from '../pages/legal/TermsOfServicePage'
import { LoginPage } from '../pages/LoginPage'
import { ForgotPasswordPage } from '../pages/password-reset/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/password-reset/ResetPasswordPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { SupplierDetailPage } from '../pages/suppliers/SupplierDetailPage'
import { SuppliersPage } from '../pages/suppliers/SuppliersPage'
import { UserDetailPage } from '../pages/users/UserDetailPage'
import { UsersPage } from '../pages/users/UsersPage'
import { setForbiddenHandler } from '../services/http'

import { ROUTE_ROLES } from './access'
import { PENDING_MODULES } from './pendingModules'
import { ProtectedRoute } from './ProtectedRoute'

const FORBIDDEN_PATH = '/sin-permiso'

export function AppRouter() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    setForbiddenHandler(() => {
      if (pathname === FORBIDDEN_PATH) return
      navigate(FORBIDDEN_PATH, { replace: true, state: { from: pathname } })
    })
    return () => setForbiddenHandler(null)
  }, [navigate, pathname])

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/forget-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/terminos" element={<TermsOfServicePage />} />
      <Route path="/privacidad" element={<PrivacyPolicyPage />} />

      <Route
        path="/sedes"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/sedes']}>
            <BranchesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/inventario"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/inventario']}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventario/consolidado"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/inventario/consolidado']}>
            <ConsolidatedInventoryPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/catalogo"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/catalogo']}>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalogo/productos/:productId"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/catalogo']}>
            <ProductDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalogo/categorias"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/catalogo/categorias']}>
            <CategoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalogo/unidades"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/catalogo/unidades']}>
            <UnitsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/proveedores"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/proveedores']}>
            <SuppliersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/proveedores/:supplierId"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/proveedores']}>
            <SupplierDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/clientes"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/clientes']}>
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes/:customerId"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/clientes']}>
            <CustomerDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/usuarios"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/usuarios']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios/:userId"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/usuarios']}>
            <UserDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/auditoria"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/auditoria']}>
            <AuditLogsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/configuracion"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />

      {PENDING_MODULES.map((module) => (
        <Route
          key={module.path}
          path={module.path}
          element={
            <ProtectedRoute>
              <ComingSoonPage title={module.title} description={module.description} />
            </ProtectedRoute>
          }
        />
      ))}

      <Route
        path={FORBIDDEN_PATH}
        element={
          <ProtectedRoute>
            <ForbiddenPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
