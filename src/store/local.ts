import { planRestore } from '../lib/backup';
import { fromLegacy, newId, sortVariants, totalOf, type Item, type Movement, type Variant } from '../types';
import type { InventoryStore, ShoppingState, User } from './types';

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
    variants: sortVariants(variants.map((v) => ({ ...v, quantity: Math.max(0, Number(v.quantity) || 0) }))),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou bloqué : on garde l'état en mémoire */
  }
}

const read = () => load<Record<string, unknown>[]>(KEY, []).map(normalize);
let memory: Stored[] = read();

const snapshot = () => memory.map((s) => ({ ...s, quantity: totalOf(s.variants) }));
function emit() {
  const items = snapshot();
  listeners.forEach((cb) => cb(items));
}

function write(next: Stored[]) {
  memory = next;
  save(KEY, next);
  emit();
  channel?.postMessage('changed');
}

function patchItem(id: string, fn: (s: Stored) => Stored) {
  write(memory.map((s) => (s.id === id ? { ...fn(s), updatedAt: Date.now() } : s)));
}

const localUser: User = { name: 'Cet appareil' };

// ---- Historique des mouvements ----
const HISTORY_KEY = 'cellier.history.v1';
/** Environ 2 ans d'usage familial ; au-delà, les plus anciennes lignes sont oubliées. */
const HISTORY_MAX = 5000;
const historyListeners = new Set<(list: Movement[]) => void>();
let history = load<Movement[]>(HISTORY_KEY, []);
function setHistory(next: Movement[]) {
  history = next.slice(0, HISTORY_MAX);
  save(HISTORY_KEY, history);
  historyListeners.forEach((cb) => cb(history));
  channel?.postMessage('history');
}

// ---- Liste de courses (partagée entre les onglets de l'appareil) ----
const SHOP_KEY = 'cellier.courses.v1';
const shopListeners = new Set<(s: ShoppingState) => void>();
const readShop = (): ShoppingState => {
  const s = load<ShoppingState | null>(SHOP_KEY, null);
  return s && Array.isArray(s.extras) && s.checked ? s : { extras: [], checked: {} };
};
let shopping = readShop();

channel?.addEventListener('message', (e) => {
  if (e.data === 'changed') {
    memory = read();
    emit();
  } else if (e.data === 'history') {
    history = load<Movement[]>(HISTORY_KEY, []);
    historyListeners.forEach((cb) => cb(history));
  } else if (e.data === 'shopping') {
    shopping = readShop();
    shopListeners.forEach((cb) => cb(shopping));
  }
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
    cb(snapshot());
    return () => listeners.delete(cb);
  },
  async create(input, id = newId()) {
    write([...memory.filter((s) => s.id !== id), normalize({ ...input, id, updatedAt: Date.now() } as unknown as Record<string, unknown>)]);
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
    setHistory([{ ...m, id: newId(), at: Date.now(), by: localUser.name }, ...history]);
  },
  subscribeHistory(cb) {
    historyListeners.add(cb);
    cb(history);
    return () => historyListeners.delete(cb);
  },
  async importItems(list, mode, current) {
    const plan = planRestore(current, list, mode);
    const gone = new Set(plan.deletes);
    const updates = new Map(plan.updates.map((u) => [u.id, u.input]));
    const now = Date.now();
    const next = memory
      .filter((s) => !gone.has(s.id))
      .map((s) => (updates.has(s.id) ? normalize({ ...updates.get(s.id), id: s.id, updatedAt: now } as unknown as Record<string, unknown>) : s));
    const taken = new Set(next.map((s) => s.id));
    for (const c of plan.creates) {
      const id = c.id && !taken.has(c.id) ? c.id : newId();
      taken.add(id);
      next.push(normalize({ ...c.input, id, updatedAt: now } as unknown as Record<string, unknown>));
    }
    write(next);
  },
  async importHistory(list) {
    const known = new Set(history.map((m) => m.id));
    const merged = [...history, ...list.filter((m) => !known.has(m.id))].sort((a, b) => b.at - a.at);
    setHistory(merged);
  },
  subscribeShopping(cb) {
    shopListeners.add(cb);
    cb(shopping);
    return () => shopListeners.delete(cb);
  },
  async setShopping(fn) {
    shopping = fn(shopping);
    save(SHOP_KEY, shopping);
    shopListeners.forEach((cb) => cb(shopping));
    channel?.postMessage('shopping');
  },
  onPending(cb) {
    cb(0);
    return () => {};
  },
  onWriteError() {
    return () => {};
  },
  currentName() {
    return localUser.name;
  },
};

/** Demande au navigateur de ne pas effacer les données de l'app quand l'espace manque. */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}
