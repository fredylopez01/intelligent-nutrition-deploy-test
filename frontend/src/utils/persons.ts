import { z } from 'zod'

import type { PersonRelationships, PersonRole, PersonSearchResult } from '../types/person'

const DOCUMENT_NUMBER_RULES: Record<string, { pattern: RegExp; message: string }> = {
  CC: { pattern: /^\d{3,15}$/, message: 'La cédula solo lleva números (entre 3 y 15)' },
  CE: { pattern: /^\d{3,15}$/, message: 'La cédula de extranjería solo lleva números' },
  NIT: {
    pattern: /^\d{5,15}(-\d)?$/,
    message: 'Escribe el NIT con números y, si aplica, el dígito de verificación (900123456-7)',
  },
  PAS: {
    pattern: /^[A-Za-z0-9]{5,20}$/,
    message: 'El pasaporte lleva entre 5 y 20 letras o números',
  },
}

export const PERSON_KIND_DOCUMENT_CODES: Record<'natural' | 'empresa', string[]> = {
  natural: ['CC', 'CE', 'PAS'],
  empresa: ['NIT'],
}

export const contactFields = {
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa el correo electrónico')
    .email('Ingresa un correo válido')
    .max(150, 'El correo no puede superar 150 caracteres'),
  phone: z
    .string()
    .trim()
    .min(1, 'Ingresa el teléfono')
    .regex(/^\d{7,15}$/, 'El teléfono solo lleva números, entre 7 y 15 dígitos'),
  address: z
    .string()
    .trim()
    .min(1, 'Ingresa la dirección')
    .max(255, 'La dirección no puede superar 255 caracteres'),
}

export const RELATIONSHIP_TAGS: Array<{ key: keyof PersonRelationships; label: string }> = [
  { key: 'hasUserAccount', label: 'Usuario' },
  { key: 'isCustomer', label: 'Cliente' },
  { key: 'isSupplier', label: 'Proveedor' },
]

export function validateDocumentNumber(code: string | undefined, value: string): string | null {
  const rule = code ? DOCUMENT_NUMBER_RULES[code] : undefined
  if (!rule) return null
  return rule.pattern.test(value) ? null : rule.message
}

export function getPersonName(person: PersonSearchResult): string {
  if (person.businessName) return person.businessName
  return [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Sin nombre'
}

export function getRoleBlock(
  person: PersonSearchResult,
  role: PersonRole,
): { message: string; href?: string } | null {
  if (role === 'customer' && person.relationships.isCustomer) {
    return { message: 'Ya es cliente', href: `/clientes/${person.id}` }
  }
  if (role === 'user' && person.relationships.hasUserAccount) {
    return { message: 'Ya tiene usuario', href: `/usuarios/${person.id}` }
  }
  if (role === 'user' && !(person.firstName && person.lastName)) {
    return { message: 'Una empresa no puede tener usuario' }
  }
  if (role === 'supplier' && person.relationships.isSupplier) {
    return { message: 'Ya es proveedor' }
  }
  return null
}

export function prefillFromSearch(term: string): { documentNumber?: string; email?: string } {
  const value = term.trim()
  if (value.includes('@')) return { email: value.toLowerCase() }
  if (/\d/.test(value) && /^[A-Za-z0-9-]+$/.test(value)) return { documentNumber: value }
  return {}
}
