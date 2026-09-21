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
    path: '/sedes',
    title: 'Sedes',
    description: 'Registro y administración de las tres sedes con su inventario asociado.',
  },
  {
    path: '/inventario',
    title: 'Inventario',
    description: 'Existencias por sede, con estado de stock óptimo o bajo.',
  },
  {
    path: '/inventario/movimientos',
    title: 'Movimientos',
    description: 'Entradas, salidas y ajustes de inventario con su motivo y responsable.',
  },
  {
    path: '/inventario/cierre',
    title: 'Cierre diario',
    description: 'Conteo ciego por sede y reporte de discrepancias contra el sistema.',
  },
  {
    path: '/catalogo',
    title: 'Catálogo',
    description: 'Catálogo maestro de productos: se registran una vez y se asignan a las sedes.',
  },
  {
    path: '/pos',
    title: 'POS',
    description: 'Punto de venta en sede, con descuento automático de inventario.',
  },
  {
    path: '/pos/ventas',
    title: 'Ventas',
    description: 'Historial de ventas por sede y reversión de tiquetes con motivo.',
  },
  {
    path: '/proveedores',
    title: 'Proveedores',
    description: 'Datos de los proveedores y su historial de compras asociadas.',
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
]
