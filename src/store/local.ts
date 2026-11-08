import { fromLegacy, newId, sortVariants, totalOf, type Item, type ItemInput, type Variant } from '../types';
import type { InventoryStore, User } from './types';

const KEY = 'cellier.items.v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cellier') : null;
const listeners = new Set<(items: Item[]) => void>();

type Stored = Omit<Item, 'quantity' | 'legacy'>;

function normalize(raw: Record<string, unknown>): Stored {
  const variants = Array.isArray(raw.variants) ? (raw.variants as Variant[]) : fromLegacy(raw);
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    category: String(raw.category ?? 'Autre'),
    location: (raw.location as string) || undefined,
    target: Number(raw.target) || 0,
    unit: String(raw.unit ?? 'pcs'),
    variants: sortVariants(variants),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function read(): Stored[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>[]).map(normalize) : [];
  } catch {
    return [];
  }
}

let memory: Stored[] = read();

function emit() {
  const items = memory.map((s) => ({ ...s, quantity: totalOf(s.variants) }));
  listeners.forEach((cb) => cb(items));
}

function write(next: Stored[]) {
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage plein ou bloqué : on garde l'état en mémoire */
  }
  emit();
  channel?.postMessage('changed');
}

channel?.addEventListener('message', () => {
  memory = read();
  emit();
});

function patchItem(id: string, fn: (s: Stored) => Stored) {
  write(memory.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)));
}

const localUser: User = { name: 'Cet appareil' };

export const localStore: InventoryStore = {
  mode: 'local',
  onUser(cb) {
    cb(localUser);
    return () => {};
  },
  async signIn() {},
  async signOut() {},
  subscribe(cb) {
    listeners.add(cb);
    cb(memory.map((s) => ({ ...s, quantity: totalOf(s.variants) })));
    return () => listeners.delete(cb);
  },
  async create(input: ItemInput) {
    const id = newId();
    write([...memory, { ...input, id, updatedAt: Date.now() }]);
    return id;
  },
  async update(id, patch) {
    patchItem(id, (s) => ({ ...s, ...patch }));
  },
  async remove(id) {
    write(memory.filter((s) => s.id !== id));
  },
  async adjust(item, variantId, delta) {
    patchItem(item.id, (s) => ({
      ...s,
      variants: s.variants.map((v) => (v.id === variantId ? { ...v, quantity: Math.max(0, v.quantity + delta) } : v)),
    }));
  },
  async addVariant(item, variant) {
    patchItem(item.id, (s) => ({ ...s, variants: [...s.variants, variant] }));
  },
  async updateVariant(item, variantId, patch) {
    patchItem(item.id, (s) => ({ ...s, variants: s.variants.map((v) => (v.id === variantId ? { ...v, ...patch } : v)) }));
  },
  async removeVariant(item, variantId) {
    patchItem(item.id, (s) => ({ ...s, variants: s.variants.filter((v) => v.id !== variantId) }));
  },
  async importItems(items) {
    write(items.map((i) => normalize({ ...i, id: newId(), updatedAt: Date.now() } as unknown as Record<string, unknown>)));
  },
};

/** Demande au navigateur de ne pas effacer les données de l'app quand l'espace manque. */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
