import { Navigate, Route, Routes } from 'react-router-dom'

import { ActivateAccountPage } from '../pages/activation/ActivateAccountPage'
import { AuditLogsPage } from '../pages/audit-logs/AuditLogsPage'
import { BranchesPage } from '../pages/branches/BranchesPage'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { GoogleAuthCallbackPage } from '../pages/GoogleAuthCallbackPage'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { ForgotPasswordPage } from '../pages/password-reset/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/password-reset/ResetPasswordPage'
import { SettingsPage } from '../pages/settings/SettingsPage'
import { SuppliersPage } from '../pages/suppliers/SuppliersPage'
import { UserDetailPage } from '../pages/users/UserDetailPage'
import { UsersPage } from '../pages/users/UsersPage'

import { PENDING_MODULES } from './pendingModules'
import { ProtectedRoute } from './ProtectedRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/forget-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/sedes"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}>
            <BranchesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/proveedores"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'BRANCH_LEADER']}>
            <SuppliersPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/usuarios"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'DEV']}>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios/:userId"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'DEV']}>
            <UserDetailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/auditoria"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN', 'DEV']}>
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

      <Route path="/sin-permiso" element={<div>No tienes permiso para ver esta página</div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
