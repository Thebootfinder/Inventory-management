/** Une référence précise (marque, millésime…) rangée sous un article. */
export interface Variant {
  id: string;
  /** Marque ou nom précis, ex. « Pago », « Innocent 1 L ». Vide = pas de précision. */
  label: string;
  barcode?: string;
  quantity: number;
  imageUrl?: string;
  createdAt: number;
}

/** Un article de l'inventaire, ex. « Jus de pomme », qui regroupe une ou plusieurs références. */
export interface Item {
  id: string;
  name: string;
  category: string;
  /** Emplacement dans le cellier, ex. « Étagère 2 ». */
  location?: string;
  /** Quantité minimale souhaitée (toutes références confondues). */
  target: number;
  unit: string;
  variants: Variant[];
  /** Total calculé de toutes les références. */
  quantity: number;
  updatedAt: number;
  /** Ancien format (avant le regroupement), converti à la première modification. */
  legacy?: boolean;
}

export interface ItemInput {
  name: string;
  category: string;
  location?: string;
  target: number;
  unit: string;
  variants: Variant[];
}

export type ItemPatch = Partial<Omit<ItemInput, 'variants'>>;

export type StockLevel = 'ok' | 'low' | 'out';

export function stockLevel(item: Pick<Item, 'quantity' | 'target'>): StockLevel {
  if (item.quantity <= 0) return 'out';
  if (item.target > 0 && item.quantity < item.target) return 'low';
  return 'ok';
}

export function totalOf(variants: Variant[]) {
  return variants.reduce((n, v) => n + Math.max(0, v.quantity), 0);
}

export function sortVariants(variants: Variant[]) {
  return [...variants].sort((a, b) => a.createdAt - b.createdAt);
}

export function variantLabel(item: Pick<Item, 'name'>, v: Pick<Variant, 'label'>) {
  return v.label.trim() || item.name;
}

export function itemImage(item: Pick<Item, 'variants'>) {
  return item.variants.find((v) => v.imageUrl)?.imageUrl;
}

export function findByBarcode(items: Item[], code: string): { item: Item; variant: Variant } | null {
  for (const item of items) {
    const variant = item.variants.find((v) => v.barcode === code);
    if (variant) return { item, variant };
  }
  return null;
}

export function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Convertit un article enregistré dans l'ancien format (quantité et code-barres à plat). */
export function fromLegacy(raw: Record<string, unknown>): Variant[] {
  return [
    {
      id: 'v0',
      label: '',
      barcode: (raw.barcode as string) || undefined,
      quantity: Math.max(0, Number(raw.quantity) || 0),
      imageUrl: (raw.imageUrl as string) || undefined,
      createdAt: 0,
    },
  ];
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
