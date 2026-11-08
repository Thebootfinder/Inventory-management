export interface Item {
  id: string;
  name: string;
  /** Code-barres EAN/UPC (optionnel). */
  barcode?: string;
  category: string;
  /** Emplacement dans le cellier, ex. « Étagère 2 ». */
  location?: string;
  quantity: number;
  /** Quantité minimale souhaitée : en dessous, l'article passe en alerte. */
  target: number;
  unit: string;
  imageUrl?: string;
  updatedAt: number;
}

export type ItemInput = Omit<Item, 'id' | 'updatedAt'>;

export type StockLevel = 'ok' | 'low' | 'out';

export function stockLevel(item: Pick<Item, 'quantity' | 'target'>): StockLevel {
  if (item.quantity <= 0) return 'out';
  if (item.target > 0 && item.quantity < item.target) return 'low';
  return 'ok';
}

export const DEFAULT_CATEGORIES = [
  'Vin',
  'Bière',
  'Spiritueux',
  'Boissons',
  'Conserves',
  'Épicerie',
  'Surgelés',
  'Entretien',
  'Autre',
];
