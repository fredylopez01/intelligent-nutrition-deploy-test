import { Navigate, Route, Routes } from 'react-router-dom'

import { ActivateAccountPage } from '../pages/activation/ActivateAccountPage'
import { BranchesPage } from '../pages/branches/BranchesPage'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { LandingPage } from '../pages/LandingPage'
import { LoginPage } from '../pages/LoginPage'
import { UsersPage } from '../pages/users/UsersPage'

import { PENDING_MODULES } from './pendingModules'
import { ProtectedRoute } from './ProtectedRoute'
import { ForgotPasswordPage } from '../pages/password-reset/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/password-reset/ResetPasswordPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
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
        path="/usuarios"
        element={
          <ProtectedRoute allowedRoles={['SUPERADMIN']}>
            <UsersPage />
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
