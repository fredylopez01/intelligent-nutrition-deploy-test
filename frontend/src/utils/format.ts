const ROLE_LABELS: Record<string, string> = {
  'SUPER ADMIN': 'Superadmin',
  'LIDER DE SEDE': 'Líder de Sede',
  'AYUDANTE DE SEDE': 'Ayudante de Sede',
}

export function getRoleLabel(roleName: string): string {
  return ROLE_LABELS[roleName.trim().toUpperCase()] ?? roleName
}

export function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'

  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

export function formatDateTime(value: string | null): string {
  if (!value) return 'Nunca'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
