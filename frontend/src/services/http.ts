const configuredApiUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
)
const API_URL = configuredApiUrl.endsWith('/api/v1')
  ? configuredApiUrl
  : `${configuredApiUrl}/api/v1`

export const API_BASE_URL = API_URL

export class ApiError extends Error {
  status: number
  details?: unknown
  code?: string

  constructor(message: string, status: number, details?: unknown, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.code = code
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null
  skipUnauthorizedHandler?: boolean
}

let onUnauthorized: (() => void) | null = null
let onForbidden: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export function setForbiddenHandler(handler: (() => void) | null) {
  onForbidden = handler
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, skipUnauthorizedHandler, ...rest } = options

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (response.status === 401 && !skipUnauthorizedHandler) {
    onUnauthorized?.()
    throw new ApiError('Sesión expirada, vuelve a iniciar sesión.', 401)
  }

  const isJson = response.headers.get('content-type')?.includes('application/json')
  const body = isJson ? await response.json() : null

  if (response.status === 403 && (rest.method ?? 'GET') === 'GET') {
    onForbidden?.()
  }

  if (!response.ok) {
    const error = body?.error
    const message =
      error?.message ?? body?.message ?? 'Ocurrió un error inesperado. Intenta de nuevo.'
    throw new ApiError(message, response.status, error?.details ?? error ?? body, error?.code)
  }

  const hasMeta = !!body && typeof body === 'object' && 'meta' in body
  return (hasMeta ? body : (body?.data ?? body)) as T
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, data: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
