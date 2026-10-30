import type { ClosureItem, ClosureSummary, InventoryClosure } from '../types/inventoryClosure'

export function buildItem(overrides: Partial<ClosureItem> = {}): ClosureItem {
  return {
    productId: 'product-whey',
    productName: 'Whey Protein 2 lb',
    referenceCode: 'WHEY-2LB',
    unit: 'und',
    expirationDate: '2027-06-30',
    physicalQuantity: null,
    observation: null,
    ...overrides,
  }
}

export function buildClosure(overrides: Partial<InventoryClosure> = {}): InventoryClosure {
  const items = overrides.items ?? [
    buildItem({ expirationDate: '2026-09-30' }),
    buildItem({ expirationDate: '2027-06-30' }),
  ]
  return {
    id: 'closure-1',
    branchId: 'branch-centro',
    branchName: 'Centro',
    closureDate: '2026-10-26',
    status: 'PENDING',
    confirmed: false,
    locked: false,
    closedAt: null,
    userName: 'Laura Pérez',
    countedItems: items.filter((item) => item.physicalQuantity !== null).length,
    totalItems: items.length,
    ...overrides,
    items,
  }
}

export function buildSummary(overrides: Partial<ClosureSummary> = {}): ClosureSummary {
  return {
    id: 'closure-1',
    branchId: 'branch-centro',
    branchName: 'Centro',
    closureDate: '2026-10-25',
    status: 'CONFIRMED',
    confirmed: true,
    locked: true,
    closedAt: '2026-10-26T01:00:00.000Z',
    userName: 'Laura Pérez',
    countedItems: 2,
    totalItems: 2,
    totalDifferences: 1,
    ...overrides,
  }
}
