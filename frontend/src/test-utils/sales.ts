import type { Sale, SaleSummary, SellableProduct } from '../types/sale'

export function buildSellable(overrides: Partial<SellableProduct> = {}): SellableProduct {
  return {
    productId: 'product-whey',
    name: 'Whey Protein 2 lb',
    referenceCode: 'WHEY-2LB',
    primaryImageUrl: null,
    price: '145000.00',
    availableQuantity: 3,
    unit: 'und',
    category: { id: 'cat-protein', name: 'Proteínas' },
    ...overrides,
  }
}

export function buildSaleSummary(overrides: Partial<SaleSummary> = {}): SaleSummary {
  return {
    id: 'sale-1',
    saleNumber: 'V-20261026-0001',
    status: 'COMPLETED',
    branch: { id: 'branch-centro', name: 'Centro' },
    user: { id: 'user-laura', fullName: 'Laura Pérez' },
    customer: null,
    saleAt: '2026-10-26T15:03:00.000Z',
    subtotal: '290000.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    total: '290000.00',
    reversalReason: null,
    reversedAt: null,
    itemsCount: 1,
    ...overrides,
  }
}

export function buildSale(overrides: Partial<Sale> = {}): Sale {
  const summary = Object.fromEntries(
    Object.entries(buildSaleSummary()).filter(([key]) => key !== 'itemsCount'),
  ) as Omit<SaleSummary, 'itemsCount'>
  return {
    ...summary,
    items: [
      {
        productId: 'product-whey',
        productName: 'Whey Protein 2 lb',
        referenceCode: 'WHEY-2LB',
        quantity: 2,
        unitPrice: '145000.00',
        subtotal: '290000.00',
        discountAmount: '0.00',
        taxAmount: '0.00',
        total: '290000.00',
      },
    ],
    payments: [
      {
        paymentMethod: { id: 'pm-cash', code: 'CASH', name: 'Efectivo' },
        amount: '290000.00',
        reference: null,
        paidAt: '2026-10-26T15:03:00.000Z',
      },
    ],
    ...overrides,
  }
}
