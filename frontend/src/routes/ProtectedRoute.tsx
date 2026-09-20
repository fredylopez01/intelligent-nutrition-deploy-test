import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../hooks/useAuth'
import type { RoleName } from '../types/auth'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: RoleName[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRoles && !allowedRoles.includes(user.role.name)) {
    return <Navigate to="/sin-permiso" replace />
  }

  return <>{children}</>
}
