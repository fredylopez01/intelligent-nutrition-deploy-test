import type { Supplier } from '../../types/supplier'

export const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: 'mock-supplier-1',
    person: {
      businessName: 'Suplementos Colombia SAS',
      documentNumber: '900123456',
      documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
      email: 'ventas@suplementoscolombia.com',
      phone: '3001234567',
      address: 'Calle 10 # 20-30, Bogotá',
      active: true,
    },
    commercialName: 'Suplementos Colombia',
  },
  {
    id: 'mock-supplier-2',
    person: {
      businessName: 'Proteínas del Valle Ltda',
      documentNumber: '800456789',
      documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
      email: 'contacto@proteinasdelvalle.com',
      phone: '3157654321',
      address: 'Av. 6N # 25-10, Cali',
      active: true,
    },
    commercialName: 'ProValle',
  },
  {
    id: 'mock-supplier-3',
    person: {
      businessName: 'Carlos Andrés Ríos Mora',
      documentNumber: '1020304050',
      documentType: { code: 'CC', name: 'Cédula de Ciudadanía' },
      email: 'carlos.rios@gmail.com',
      phone: '3209988776',
      address: null,
      active: false,
    },
    commercialName: 'Distribuciones Ríos',
  },
  {
    id: 'mock-supplier-4',
    person: {
      businessName: 'NutriSport Andina SAS',
      documentNumber: '901234567',
      documentType: { code: 'NIT', name: 'Número de Identificación Tributaria' },
      email: 'info@nutrisportandina.com',
      phone: '6014567890',
      address: 'Carrera 15 # 80-45, Bogotá',
      active: true,
    },
    commercialName: 'NutriSport',
  },
  {
    id: 'mock-supplier-5',
    person: {
      businessName: 'María Fernanda Ospina',
      documentNumber: '43210987',
      documentType: { code: 'CC', name: 'Cédula de Ciudadanía' },
      email: 'mf.ospina@outlook.com',
      phone: '3142223344',
      address: 'Calle 50 # 70-20, Medellín',
      active: true,
    },
    commercialName: 'Ospina Nutrición',
  },
]
