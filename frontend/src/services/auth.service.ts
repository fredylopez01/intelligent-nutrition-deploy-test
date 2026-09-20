import type { LoginCredentials, LoginResponse, SessionUser } from '../types/auth'

import { http } from './http'

export const authService = {
  login: (credentials: LoginCredentials) => http.post<LoginResponse>('/auth/login', credentials),
  me: (token: string) => http.get<SessionUser>('/auth/me', { token }),
}
