import type { Item, ItemInput, ItemPatch, Movement, MovementInput, Variant } from '../types';

export interface User {
  name: string;
  email?: string;
  photoUrl?: string;
}

/** Une ligne cochée de la liste de courses partagée. */
export interface ShoppingLine {
  qty: number;
  variantId?: string;
  /** Prix unitaire payé, pour le budget. */
  price?: number;
  /** Prénom de la personne qui l'a cochée. */
  by?: string;
}

/** Liste de courses partagée entre tous les téléphones de la maison. */
export interface ShoppingState {
  /** Articles ajoutés à la main (en plus de ceux sous leur seuil). */
  extras: string[];
  checked: Record<string, ShoppingLine>;
}

export type RestoreMode = 'replace' | 'merge';

/**
 * Source de données de l'inventaire. Deux implémentations :
 * - `cloud` : Firebase Firestore, synchronisé en temps réel entre tous les téléphones ;
 * - `local` : stockage du navigateur, synchronisé entre onglets du même appareil.
 *
 * Les écritures rendent la main tout de suite (elles partent dans le cache local et sont
 * envoyées dès que le réseau le permet) : l'app ne reste jamais bloquée hors-ligne.
 * Un refus du serveur arrive plus tard via `onWriteError`.
 */
export interface InventoryStore {
  mode: 'cloud' | 'local';
  onUser(cb: (user: User | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (items: Item[]) => void, onError: (e: Error) => void): () => void;
  /** Crée un article ; `id` permet de recréer un article supprimé avec son identifiant (et donc son historique). */
  create(input: ItemInput, id?: string): Promise<string>;
  update(id: string, patch: ItemPatch): Promise<void>;
  remove(id: string): Promise<void>;
  /** Ajoute (delta > 0) ou retire (delta < 0) du stock d'une référence. Le stock ne descend jamais sous zéro. */
  adjust(item: Item, variantId: string, delta: number): Promise<void>;
  addVariant(item: Item, variant: Variant): Promise<void>;
  updateVariant(item: Item, variantId: string, patch: Partial<Omit<Variant, 'id'>>): Promise<void>;
  removeVariant(item: Item, variantId: string): Promise<void>;
  /** Ajoute une ligne à l'historique des mouvements. */
  logMovement(m: MovementInput): Promise<void>;
  /** Écoute l'historique depuis `since` (ms), du plus récent au plus ancien. */
  subscribeHistory(cb: (list: Movement[]) => void, since: number): () => void;
  /** Restaure une sauvegarde : `replace` efface d'abord l'inventaire, `merge` fusionne par identifiant, code-barres ou nom. */
  importItems(items: (ItemInput & { id?: string })[], mode: RestoreMode, current: Item[]): Promise<void>;
  /** Réinjecte un historique sauvegardé (les lignes déjà présentes sont ignorées). */
  importHistory(list: Movement[]): Promise<void>;
  /** Liste de courses partagée. */
  subscribeShopping(cb: (s: ShoppingState) => void): () => void;
  setShopping(fn: (s: ShoppingState) => ShoppingState): Promise<void>;
  /** Nombre d'écritures pas encore confirmées par le serveur (0 en mode local). */
  onPending(cb: (n: number) => void): () => void;
  onWriteError(cb: (e: Error) => void): () => void;
  /** Prénom affiché dans l'historique et la liste de courses. */
  currentName(): string;
}
