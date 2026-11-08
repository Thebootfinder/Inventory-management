import type { Item, ItemInput } from '../types';
import type { InventoryStore, User } from './types';

const KEY = 'cellier.items.v1';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cellier') : null;
const listeners = new Set<(items: Item[]) => void>();

function read(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* stockage plein ou bloqué : on garde l'état en mémoire */
  }
  memory = items;
  emit();
  channel?.postMessage('changed');
}

let memory: Item[] = read();

function emit() {
  const sorted = [...memory];
  listeners.forEach((cb) => cb(sorted));
}

channel?.addEventListener('message', () => {
  memory = read();
  emit();
});

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    cb([...memory]);
    return () => listeners.delete(cb);
  },
  async create(input: ItemInput) {
    const id = uid();
    write([...memory, { ...input, id, updatedAt: Date.now() }]);
    return id;
  },
  async update(id, patch) {
    write(memory.map((it) => (it.id === id ? { ...it, ...patch, updatedAt: Date.now() } : it)));
  },
  async adjust(id, delta) {
    write(
      memory.map((it) =>
        it.id === id ? { ...it, quantity: Math.max(0, it.quantity + delta), updatedAt: Date.now() } : it,
      ),
    );
  },
  async remove(id) {
    write(memory.filter((it) => it.id !== id));
  },
};
