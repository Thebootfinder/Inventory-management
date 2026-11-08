import type { Item, ItemInput } from '../types';

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
  /** Écoute l'utilisateur connecté (toujours un utilisateur fictif en mode local). */
  onUser(cb: (user: User | null) => void): () => void;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  subscribe(cb: (items: Item[]) => void, onError: (e: Error) => void): () => void;
  create(input: ItemInput): Promise<string>;
  update(id: string, patch: Partial<ItemInput>): Promise<void>;
  /** Ajoute (delta > 0) ou retire (delta < 0) du stock, de façon atomique côté serveur. */
  adjust(id: string, delta: number): Promise<void>;
  remove(id: string): Promise<void>;
}
