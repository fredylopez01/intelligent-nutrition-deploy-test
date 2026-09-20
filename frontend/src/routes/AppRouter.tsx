import { Navigate, Route, Routes } from 'react-router-dom'

import { LoginPage } from '../pages/LoginPage'

import { ProtectedRoute } from './ProtectedRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <div>Dashboard (pendiente)</div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute allowedRoles={['SUPER ADMIN']}>
            <div>Usuarios (pendiente)</div>
          </ProtectedRoute>
        }
      />
      <Route path="/sin-permiso" element={<div>No tienes permiso para ver esta página</div>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
