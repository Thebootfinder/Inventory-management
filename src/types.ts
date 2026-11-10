/** Une référence précise (marque, millésime…) rangée sous un article. */
export interface Variant {
  id: string;
  /** Marque ou nom précis, ex. « Pago », « Innocent 1 L ». Vide = pas de précision. */
  label: string;
  barcode?: string;
  quantity: number;
  imageUrl?: string;
  createdAt: number;
  /** Emplacement propre à cette référence quand elle n'est pas rangée avec le reste (cave, congélateur…). */
  location?: string;
  /** Prochaine date de péremption (AAAA-MM-JJ). */
  expiry?: string;
  /** Prix d'achat unitaire, en euros. */
  price?: number;
  /** Fiche vin : millésime, appellation, couleur, période de dégustation, note. */
  wine?: WineInfo;
}

export type WineColor = 'rouge' | 'blanc' | 'rosé' | 'pétillant' | 'liquoreux';
export const WINE_COLORS: WineColor[] = ['rouge', 'blanc', 'rosé', 'pétillant', 'liquoreux'];

export interface WineInfo {
  vintage?: number;
  appellation?: string;
  color?: WineColor;
  /** Années de début et de fin de la période idéale de dégustation. */
  drinkFrom?: number;
  drinkUntil?: number;
  /** Note de 1 à 5. */
  rating?: number;
  notes?: string;
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

export type MovementReason = 'scan' | 'manuel' | 'courses' | 'création' | 'suppression' | 'inventaire';

/** Une ligne de l'historique : qui a ajouté ou retiré quoi, et quand. */
export interface Movement {
  id: string;
  at: number;
  itemId: string;
  itemName: string;
  variantLabel?: string;
  category: string;
  /** Positif = entrée, négatif = sortie. */
  delta: number;
  reason: MovementReason;
  by: string;
  /** Prix unitaire payé (entrées issues des courses), pour le budget. */
  price?: number;
}

export type MovementInput = Omit<Movement, 'id' | 'at' | 'by'>;

// ---------- Péremption ----------

/** Nombre de jours avant l'alerte « à consommer bientôt ». */
export const EXPIRY_SOON_DAYS = 14;

export type ExpiryState = 'expired' | 'soon' | 'ok';

export function daysUntil(date: string, now = Date.now()) {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return Infinity;
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((target - start) / 864e5);
}

export function expiryState(date: string | undefined, now = Date.now()): ExpiryState {
  if (!date) return 'ok';
  const d = daysUntil(date, now);
  if (d < 0) return 'expired';
  if (d <= EXPIRY_SOON_DAYS) return 'soon';
  return 'ok';
}

/** La date de péremption la plus proche parmi les références encore en stock. */
export function nextExpiry(item: Pick<Item, 'variants'>): string | undefined {
  return item.variants
    .filter((v) => v.expiry && v.quantity > 0)
    .map((v) => v.expiry!)
    .sort()[0];
}

// ---------- Vin ----------

export type DrinkWindow = 'wait' | 'ready' | 'past';

export function drinkWindow(wine: WineInfo | undefined, year = new Date().getFullYear()): DrinkWindow | undefined {
  if (!wine || (!wine.drinkFrom && !wine.drinkUntil)) return undefined;
  if (wine.drinkFrom && year < wine.drinkFrom) return 'wait';
  if (wine.drinkUntil && year > wine.drinkUntil) return 'past';
  return 'ready';
}

// ---------- Valeur, prévision ----------

/** Valeur du stock : quantité × prix connu de chaque référence. */
export function stockValue(items: Pick<Item, 'variants'>[]) {
  let value = 0;
  let priced = 0;
  for (const i of items)
    for (const v of i.variants) {
      if (v.price && v.price > 0) {
        value += v.price * v.quantity;
        priced++;
      }
    }
  return { value, priced };
}

/** Fenêtre d'observation de la consommation pour la prévision de rupture. */
export const FORECAST_DAYS = 90;

/**
 * Prévision de rupture : consommation moyenne par jour sur les 90 derniers jours
 * (à partir du premier mouvement connu si l'historique est plus court).
 * Renvoie le nombre de jours de stock restants, ou null si pas assez de données.
 */
export function forecast(item: Pick<Item, 'id' | 'quantity'>, movements: Movement[], now = Date.now()) {
  const since = now - FORECAST_DAYS * 864e5;
  let consumed = 0;
  let first = now;
  for (const m of movements) {
    if (m.itemId !== item.id || m.at < since) continue;
    if (m.at < first) first = m.at;
    if (m.delta < 0 && m.reason !== 'suppression' && m.reason !== 'inventaire') consumed += -m.delta;
  }
  // Au moins une semaine d'observation et 2 sorties, sinon la moyenne ne veut rien dire.
  const days = (now - first) / 864e5;
  if (consumed < 2 || days < 7) return null;
  const perDay = consumed / days;
  return { perDay, perMonth: perDay * 30, daysLeft: item.quantity / perDay };
}

/** Seuil conseillé : environ deux semaines de consommation, au moins 1. */
export function suggestedTarget(perMonth: number) {
  return Math.max(1, Math.round(perMonth / 2));
}

export const euro = (n: number) =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n >= 100 ? 0 : 2 });
