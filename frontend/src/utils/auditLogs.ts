import type { AuditLog } from '../types/auditLog'

import {
  ACTION_LABELS,
  ENTITY_LABELS,
  formatDateTime,
  getActionLabel,
  getEntityLabel,
} from './format'

export const AUDIT_ACTION_OPTIONS = Object.entries(ACTION_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'))

export const AUDIT_ENTITY_OPTIONS = Object.entries(ENTITY_LABELS)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'))

export function auditExecutor(log: AuditLog): string {
  if (log.user?.fullName) return log.user.fullName
  const person = log.userAccount?.person
  if (!person) return 'Usuario eliminado'
  return `${person.firstName} ${person.lastName}`.trim() || person.email
}

function csvCell(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const BOM = String.fromCharCode(0xfeff)

export const AUDIT_CSV_HEADERS = [
  'Fecha',
  'Ejecutado por',
  'Acción',
  'Entidad',
  'Id de la entidad',
  'Motivo',
  'IP',
  'Antes',
  'Después',
]

export const AUDIT_CSV_SUMMARY_HEADERS = ['Fecha', 'Ejecutado por', 'Acción', 'Motivo', 'IP']

export function buildAuditCsv(logs: AuditLog[], includeDetails = true): string {
  const rows = logs.map((log) =>
    (includeDetails
      ? [
          formatDateTime(log.createdAt),
          auditExecutor(log),
          getActionLabel(log.action),
          getEntityLabel(log.entity),
          log.entityId,
          log.reason,
          log.ipAddress,
          log.oldData,
          log.newData,
        ]
      : [
          formatDateTime(log.createdAt),
          auditExecutor(log),
          getActionLabel(log.action),
          log.reason,
          log.ipAddress,
        ]
    )
      .map(csvCell)
      .join(','),
  )
  const headers = includeDetails ? AUDIT_CSV_HEADERS : AUDIT_CSV_SUMMARY_HEADERS
  return `${BOM}${[headers.join(','), ...rows].join('\n')}`
}
