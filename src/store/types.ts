import type { Item, ItemInput, ItemPatch, Movement, MovementInput, Variant } from '../types';

export interface User {
  name: string;
  email?: string;
  photoUrl?: string;
}

/**
 * Source de données de l'inventaire. Deux implémentations :
 * - `cloud` : Firebase Firestore, synchronisé en temps réel entre tous les téléphones ;
 * - `local` : stockage du navigateur, synchronisé entre onglets du même appareil.
 */
export interface InventoryStore {
  mode: 'cloud' | 'local';
  onUser(cb: (user: User | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (items: Item[]) => void, onError: (e: Error) => void): () => void;
  create(input: ItemInput): Promise<string>;
  update(id: string, patch: ItemPatch): Promise<void>;
  remove(id: string): Promise<void>;
  /** Ajoute (delta > 0) ou retire (delta < 0) du stock d'une référence, de façon atomique. */
  adjust(item: Item, variantId: string, delta: number): Promise<void>;
  addVariant(item: Item, variant: Variant): Promise<void>;
  updateVariant(item: Item, variantId: string, patch: Partial<Omit<Variant, 'id'>>): Promise<void>;
  removeVariant(item: Item, variantId: string): Promise<void>;
  /** Ajoute une ligne à l'historique des mouvements. */
  logMovement(m: MovementInput): Promise<void>;
  /** Écoute l'historique, du plus récent au plus ancien. */
  subscribeHistory(cb: (list: Movement[]) => void): () => void;
  /** Restaure une sauvegarde (remplace tout en local, ajoute en ligne). */
  importItems(items: ItemInput[]): Promise<void>;
}
