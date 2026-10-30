import type { Purchase, PurchaseSummary } from '../types/purchase'

export function buildPurchaseSummary(overrides: Partial<PurchaseSummary> = {}): PurchaseSummary {
  return {
    id: 'purchase-1',
    purchaseNumber: 'C-20261026-0001',
    status: 'PENDING_RECEIPT',
    supplier: {
      id: 'supplier-1',
      commercialName: 'Nutri Andina',
      businessName: 'Nutri Andina SAS',
    },
    total: '3500000.00',
    purchaseAt: '2026-10-26T15:00:00.000Z',
    itemsCount: 2,
    ...overrides,
  }
}

export function buildPurchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: 'purchase-1',
    purchaseNumber: 'C-20261026-0001',
    status: 'PENDING_RECEIPT',
    supplier: {
      id: 'supplier-1',
      commercialName: 'Nutri Andina',
      businessName: 'Nutri Andina SAS',
    },
    user: { id: 'admin', fullName: 'System Administrator' },
    purchaseAt: '2026-10-26T15:00:00.000Z',
    subtotal: '3500000.00',
    total: '3500000.00',
    observation: 'Pedido mensual',
    items: [
      {
        id: 'detail-whey',
        productId: 'product-whey',
        productName: 'Whey Protein 2 lb',
        referenceCode: 'WHEY-2LB',
        requestedQuantity: 20,
        receivedQuantity: 5,
        unitPrice: '100000.00',
        subtotal: '2000000.00',
        received: false,
        observation: null,
      },
      {
        id: 'detail-creatine',
        productId: 'product-creatine',
        productName: 'Creatina 300 g',
        referenceCode: 'CREA-300',
        requestedQuantity: 15,
        receivedQuantity: 0,
        unitPrice: '100000.00',
        subtotal: '1500000.00',
        received: false,
        observation: null,
      },
    ],
    ...overrides,
  }
}
