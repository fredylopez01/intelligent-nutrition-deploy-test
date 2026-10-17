import type { BranchInventoryDetail, BranchInventoryItem } from '../types/inventory'

export const BRANCHES = [
  { id: 'branch-centro', name: 'Centro', address: 'Calle 1', phone: '3000000000', active: true },
  { id: 'branch-norte', name: 'Norte', address: 'Calle 2', phone: '3000000001', active: true },
  { id: 'branch-sur', name: 'Sur', address: 'Calle 3', phone: '3000000002', active: false },
]

export function buildInventoryItem(
  overrides: Partial<BranchInventoryItem> = {},
): BranchInventoryItem {
  return {
    product: {
      id: 'product-whey',
      name: 'Whey Protein 2 lb',
      referenceCode: 'WHEY-2LB-001',
      category: { id: 'cat-protein', name: 'Proteínas' },
      unitOfMeasure: { abbreviation: 'und' },
      price: '145000.00',
      active: true,
    },
    totalQuantity: 35,
    minimumStock: 8,
    lowStock: false,
    ...overrides,
  }
}

export function buildInventoryDetail(
  overrides: Partial<BranchInventoryDetail> = {},
): BranchInventoryDetail {
  return {
    ...buildInventoryItem(),
    branchId: 'branch-centro',
    lots: [
      {
        id: 'lot-1',
        quantity: 20,
        expirationDate: '2026-06-30T00:00:00Z',
        updatedAt: '2026-01-07T15:30:00Z',
      },
      {
        id: 'lot-2',
        quantity: 15,
        expirationDate: '2026-12-31T00:00:00Z',
        updatedAt: '2026-01-07T15:30:00Z',
      },
    ],
    ...overrides,
  }
}

export function inventoryPage<T>(data: T[], meta: Partial<{ page: number; total: number }> = {}) {
  const total = meta.total ?? data.length
  return {
    data,
    meta: {
      page: meta.page ?? 1,
      limit: 10,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / 10),
    },
  }
}

export function withoutThresholds<T extends { minimumStock?: number; lowStock?: boolean }>(
  item: T,
): T {
  const copy = { ...item }
  delete copy.minimumStock
  delete copy.lowStock
  return copy
}
