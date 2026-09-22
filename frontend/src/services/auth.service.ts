import type {
  ActivateAccountPayload,
  LoginCredentials,
  LoginResponse,
  SessionUser,
} from '../types/auth'

import { http } from './http'

export const authService = {
  login: (credentials: LoginCredentials) => http.post<LoginResponse>('/auth/login', credentials),
  me: (token: string) => http.get<SessionUser>('/auth/me', { token }),

  activate: (payload: ActivateAccountPayload) =>
    http.post<{ message?: string }>('/auth/activate', payload, { skipUnauthorizedHandler: true }),
}
