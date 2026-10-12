import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { ActivateAccountPage } from '../pages/activation/ActivateAccountPage'
import { AuditLogsPage } from '../pages/audit-logs/AuditLogsPage'
import { BranchesPage } from '../pages/branches/BranchesPage'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { CustomerDetailPage } from '../pages/customers/CustomerDetailPage'
import { CustomersPage } from '../pages/customers/CustomersPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { GoogleAuthCallbackPage } from '../pages/GoogleAuthCallbackPage'
import { LandingPage } from '../pages/LandingPage'
import { PrivacyPolicyPage } from '../pages/legal/PrivacyPolicyPage'
import { TermsOfServicePage } from '../pages/legal/TermsOfServicePage'
import { LoginPage } from '../pages/LoginPage'
import { ForgotPasswordPage } from '../pages/password-reset/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/password-reset/ResetPasswordPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
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
        path="/proveedores"
        element={
          <ProtectedRoute allowedRoles={ROUTE_ROLES['/proveedores']}>
            <SuppliersPage />
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
