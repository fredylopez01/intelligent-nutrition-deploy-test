import type { Category } from '../types/category'
import type { Product } from '../types/product'
import type { UnitOfMeasure } from '../types/unit'

export const CATEGORIES: Category[] = [
  { id: 'cat-protein', name: 'Proteínas', description: 'Suplementos', active: true },
  { id: 'cat-vitamins', name: 'Vitaminas', description: 'Multivitamínicos', active: true },
]

export const UNITS: UnitOfMeasure[] = [
  { id: 'unit-und', name: 'Unidad', abbreviation: 'und', active: true },
  { id: 'unit-kg', name: 'Kilogramo', abbreviation: 'kg', active: true },
]

export function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-whey',
    name: 'Whey Protein 2 lb',
    referenceCode: 'WHEY-2LB-001',
    description: 'Proteína de suero',
    category: { id: 'cat-protein', name: 'Proteínas' },
    unitOfMeasure: { id: 'unit-und', name: 'Unidad', abbreviation: 'und' },
    price: '145000.00',
    active: true,
    primaryImageUrl: null,
    images: [],
    createdAt: '2026-10-07T15:30:00Z',
    updatedAt: '2026-10-07T15:30:00Z',
    ...overrides,
  }
}

export function optionsPage<T>(data: T[]) {
  return { data, meta: { page: 1, limit: 100, total: data.length, totalPages: 1 } }
}
