export interface PendingModule {
  path: string
  title: string
  description: string
}

export const PENDING_MODULES: PendingModule[] = [
  {
    path: '/dashboard',
    title: 'Dashboard',
    description: 'Ventas del día, stock por sede y alertas de inventario en una sola vista.',
  },
  {
    path: '/pos/ventas',
    title: 'Ventas',
    description: 'Historial de ventas por sede y reversión de tiquetes con motivo.',
  },
  {
    path: '/proveedores/compras',
    title: 'Compras y recepción',
    description: 'Registro de compras, recepción parcial y asignación del stock general.',
  },
  {
    path: '/reportes',
    title: 'Reportes',
    description: 'Ventas del periodo, participación por sede y rotación de inventario.',
  },
  {
    path: '/reportes/reposicion',
    title: 'Reposición sugerida',
    description: 'Sugerencia informativa de reposición a partir del histórico de ventas.',
  },
  {
    path: '/perfil',
    title: 'Mi perfil',
    description: 'Consulta y actualiza tus datos personales y de contacto.',
  },
]
