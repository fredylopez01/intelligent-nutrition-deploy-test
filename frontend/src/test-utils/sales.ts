import type { SellableProduct } from '../types/sale'

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
