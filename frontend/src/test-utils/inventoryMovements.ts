import type { BranchInventoryDetail, BranchInventoryItem } from '../types/inventory'
import type { InventoryMovement, RegisteredMovement } from '../types/inventoryMovement'

export const CENTRO = { id: 'branch-centro', name: 'Centro', active: true }
export const NORTE = { id: 'branch-norte', name: 'Norte', active: true }

export function buildMovement(overrides: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: 'movement-1',
    movementType: 'EXIT',
    quantity: 3,
    expirationDate: '2027-01-31',
    product: {
      id: 'product-whey',
      name: 'Whey Protein 2 lb',
      referenceCode: 'WHEY-2LB',
      unit: 'und',
    },
    branch: { id: CENTRO.id, name: CENTRO.name },
    originBranch: null,
    user: { id: 'user-laura', fullName: 'Laura Pérez' },
    observation: 'Empaque roto',
    saleId: null,
    purchaseId: null,
    movementAt: '2026-10-26T19:05:00.000Z',
    ...overrides,
  }
}

export function buildRegistered(overrides: Partial<RegisteredMovement> = {}): RegisteredMovement {
  return { ...buildMovement(), resultingQuantity: 12, ...overrides }
}

export const WHEY_ITEM: BranchInventoryItem = {
  product: {
    id: 'product-whey',
    name: 'Whey Protein 2 lb',
    referenceCode: 'WHEY-2LB',
    category: { id: 'cat-protein', name: 'Proteínas' },
    unitOfMeasure: { abbreviation: 'und' },
    price: '145000.00',
    active: true,
  },
  totalQuantity: 15,
  minimumStock: 5,
  lowStock: false,
}

export function wheyDetail(
  lots: { expirationDate: string; quantity: number }[],
): BranchInventoryDetail {
  return {
    ...WHEY_ITEM,
    branchId: CENTRO.id,
    totalQuantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
    lots: lots.map((lot, index) => ({
      id: `lot-${index}`,
      quantity: lot.quantity,
      expirationDate: `${lot.expirationDate}T00:00:00.000Z`,
    })),
  }
}

export function inventoryPage(items: BranchInventoryItem[]) {
  return {
    data: items,
    meta: { page: 1, limit: 8, total: items.length, totalPages: items.length ? 1 : 0 },
  }
}
