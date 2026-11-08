import { fromLegacy, newId, sortVariants, totalOf, type Item, type ItemInput, type Movement, type Variant } from '../types';
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

channel?.addEventListener('message', (e) => {
  if (e.data !== 'changed') return;
  memory = read();
  emit();
});

function patchItem(id: string, fn: (s: Stored) => Stored) {
  write(memory.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)));
}

const localUser: User = { name: 'Cet appareil' };

// ---- Historique des mouvements ----
const HISTORY_KEY = 'cellier.history.v1';
/** Environ 2 ans d'usage familial ; au-delà, les plus anciennes lignes sont oubliées. */
const HISTORY_MAX = 5000;
const historyListeners = new Set<(list: Movement[]) => void>();

function readHistory(): Movement[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as Movement[];
  } catch {
    return [];
  }
}
let history = readHistory();

function emitHistory() {
  historyListeners.forEach((cb) => cb(history));
}
channel?.addEventListener('message', (e) => {
  if (e.data !== 'history') return;
  history = readHistory();
  emitHistory();
});

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
  async logMovement(m) {
    history = [{ ...m, id: newId(), at: Date.now(), by: localUser.name }, ...history].slice(0, HISTORY_MAX);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {
      /* stockage plein */
    }
    emitHistory();
    channel?.postMessage('history');
  },
  subscribeHistory(cb) {
    historyListeners.add(cb);
    cb(history);
    return () => historyListeners.delete(cb);
  },
  async importItems(items) {
    write(items.map((i) => normalize({ ...i, id: newId(), updatedAt: Date.now() } as unknown as Record<string, unknown>)));
  },
};

/** Demande au navigateur de ne pas effacer les données de l'app quand l'espace manque. */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
