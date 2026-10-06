import type {
  ActivateAccountPayload,
  ChangePasswordPayload,
  LoginCredentials,
  LoginResponse,
  SessionUser,
} from '../types/auth'

import { API_BASE_URL, http } from './http'

export const authService = {
  googleLoginUrl: () => `${API_BASE_URL}/auth/google`,
  login: (credentials: LoginCredentials) => http.post<LoginResponse>('/auth/login', credentials),
  me: (token: string) => http.get<SessionUser>('/auth/me', { token }),

  activate: (payload: ActivateAccountPayload) =>
    http.post<{ message?: string }>('/auth/activate', payload, { skipUnauthorizedHandler: true }),
  forgotPassword: (payload: { email: string }) =>
    http.post<{ message: string }>('/auth/forgot-password', payload, {
      skipUnauthorizedHandler: true,
    }),

  resetPassword: (payload: { token: string; password: string }) =>
    http.post<{ message: string }>('/auth/reset-password', payload, {
      skipUnauthorizedHandler: true,
    }),

  // A wrong current password answers 401, so the global logout handler must not run here.
  changePassword: (payload: ChangePasswordPayload, token: string | null) =>
    http.post<{ message: string }>('/auth/change-password', payload, {
      token,
      skipUnauthorizedHandler: true,
    }),
}
