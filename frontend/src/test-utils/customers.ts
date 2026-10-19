import type { Customer } from '../types/customer'
import type { DocumentType } from '../types/supplier'

export const DOCUMENT_TYPES: DocumentType[] = [
  { id: 'doc-cc', code: 'CC', name: 'Cédula de Ciudadanía', active: true },
  { id: 'doc-ce', code: 'CE', name: 'Cédula de Extranjería', active: true },
  { id: 'doc-nit', code: 'NIT', name: 'Número de Identificación Tributaria', active: true },
  { id: 'doc-pas', code: 'PAS', name: 'Pasaporte', active: true },
]

export function buildNaturalCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-laura',
    fullName: 'Laura Pérez',
    active: true,
    createdAt: '2026-10-07T15:30:00.000Z',
    updatedAt: '2026-10-07T15:30:00.000Z',
    person: {
      id: 'customer-laura',
      documentTypeId: 'doc-cc',
      documentNumber: '1049000111',
      firstName: 'Laura',
      lastName: 'Pérez',
      businessName: null,
      email: 'laura@correo.com',
      phone: '3001112233',
      address: 'Calle 20 # 10-15, Tunja',
      documentType: { code: 'CC', name: 'Cédula de Ciudadanía' },
    },
    ...overrides,
  }
}

export function buildCompanyCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-gym',
    fullName: 'Gimnasio Fuerza SAS',
    active: true,
    createdAt: '2026-10-07T15:30:00.000Z',
    updatedAt: '2026-10-07T15:30:00.000Z',
    person: {
      id: 'customer-gym',
      documentTypeId: 'doc-nit',
      documentNumber: '900123456-7',
      firstName: null,
      lastName: null,
      businessName: 'Gimnasio Fuerza SAS',
      email: 'gym@correo.com',
      phone: '6087401122',
      address: 'Av. Norte # 45-10, Tunja',
      documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
    },
    ...overrides,
  }
}
