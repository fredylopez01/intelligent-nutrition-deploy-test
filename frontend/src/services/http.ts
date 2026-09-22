const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

interface RequestOptions extends RequestInit {
  token?: string | null
  /**
   * Para endpoints públicos (activación de cuenta, etc.): un 401 aquí NO significa
   * "sesión expirada", así que no se dispara el handler global y se conserva el
   * mensaje del backend.
   */
  skipUnauthorizedHandler?: boolean
}

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
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

  if (!response.ok) {
    const message = body?.message ?? 'Ocurrió un error inesperado. Intenta de nuevo.'
    throw new ApiError(message, response.status, body)
  }

  return body as T
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
