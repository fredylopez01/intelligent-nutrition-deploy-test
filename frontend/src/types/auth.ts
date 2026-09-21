export type RoleName = 'SUPER ADMIN' | 'Lider de sede' | 'Ayudante de sede'

export interface UserRole {
  id?: string
  name: RoleName
}

export interface SessionUser {
  id: string
  fullName: string
  email: string
  roleId: string
  active: boolean
  role: UserRole
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  expiresIn: string
}

/** POST /auth/activate: el usuario define su contraseña inicial con el token del correo. */
export interface ActivateAccountPayload {
  token: string
  password: string
}

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error'

export interface AuthState {
  user: SessionUser | null
  token: string | null
  status: AuthStatus
  error: string | null
  login: (credentials: LoginCredentials) => Promise<SessionUser>
  logout: () => void
}
