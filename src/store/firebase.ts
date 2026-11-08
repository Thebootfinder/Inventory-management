import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { fromLegacy, sortVariants, totalOf, type Item, type ItemInput, type Movement, type Variant } from '../types';
import type { InventoryStore } from './types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

/** Retire les champs `undefined`, refusés par Firestore. */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Les références sont stockées dans une map `variants.{id}` (et non un tableau)
 * pour pouvoir incrémenter la quantité d'une seule référence de façon atomique.
 */
function variantsToMap(variants: Variant[]) {
  return Object.fromEntries(variants.map(({ id, ...v }) => [id, clean(v)]));
}

export function createFirebaseStore(config: FirebaseConfig): InventoryStore {
  const app = initializeApp(config);
  const auth = getAuth(app);
  // Cache persistant : l'app reste utilisable hors-ligne (au fond du cellier, sans réseau)
  // et renvoie les modifications dès que la connexion revient.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const items = collection(db, 'items');
  const movements = collection(db, 'movements');
  const ref = (id: string) => doc(items, id);

  /** Convertit un document de l'ancien format avant d'y toucher. */
  async function migrate(item: Item) {
    if (!item.legacy) return;
    await updateDoc(ref(item.id), {
      variants: variantsToMap(item.variants),
      quantity: deleteField(),
      barcode: deleteField(),
      imageUrl: deleteField(),
    });
  }

  return {
    mode: 'cloud',
    onUser(cb) {
      return onAuthStateChanged(auth, (u) =>
        cb(
          u
            ? { name: u.displayName ?? u.email ?? 'Utilisateur', email: u.email ?? undefined, photoUrl: u.photoURL ?? undefined }
            : null,
        ),
      );
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        // Les popups sont souvent bloquées sur mobile / en mode « app installée » : on bascule en redirection.
        const code = (e as { code?: string }).code ?? '';
        if (code.includes('popup')) await signInWithRedirect(auth, provider);
        else throw e;
      }
    },
    async signOut() {
      await signOut(auth);
    },
    subscribe(cb, onError) {
      return onSnapshot(
        items,
        (snap) => {
          cb(
            snap.docs.map((d) => {
              const data = d.data();
              const ts = data.updatedAt as Timestamp | null | undefined;
              const legacy = !data.variants;
              const variants = legacy
                ? fromLegacy(data)
                : sortVariants(
                    Object.entries(data.variants as Record<string, Omit<Variant, 'id'>>).map(([id, v]) => ({
                      id,
                      label: v.label ?? '',
                      barcode: v.barcode || undefined,
                      quantity: Math.max(0, Number(v.quantity) || 0),
                      imageUrl: v.imageUrl || undefined,
                      createdAt: Number(v.createdAt) || 0,
                    })),
                  );
              return {
                id: d.id,
                name: data.name ?? '',
                category: data.category ?? 'Autre',
                location: data.location || undefined,
                target: Number(data.target) || 0,
                unit: data.unit ?? 'pcs',
                variants,
                quantity: totalOf(variants),
                updatedAt: ts?.toMillis?.() ?? Date.now(),
                legacy,
              } satisfies Item;
            }),
          );
        },
        (err) => onError(err),
      );
    },
    async create(input: ItemInput) {
      const { variants, ...rest } = input;
      const created = await addDoc(items, { ...clean(rest), variants: variantsToMap(variants), updatedAt: serverTimestamp() });
      return created.id;
    },
    async update(id, patch) {
      await updateDoc(ref(id), { ...clean(patch), updatedAt: serverTimestamp() });
    },
    async remove(id) {
      await deleteDoc(ref(id));
    },
    async adjust(item, variantId, delta) {
      await migrate(item);
      // increment() est atomique : deux personnes qui scannent en même temps ne s'écrasent pas.
      await updateDoc(ref(item.id), { [`variants.${variantId}.quantity`]: increment(delta), updatedAt: serverTimestamp() });
    },
    async addVariant(item, variant) {
      await migrate(item);
      const { id, ...v } = variant;
      await updateDoc(ref(item.id), { [`variants.${id}`]: clean(v), updatedAt: serverTimestamp() });
    },
    async updateVariant(item, variantId, patch) {
      await migrate(item);
      const fields = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [`variants.${variantId}.${k}`, v === undefined ? deleteField() : v]),
      );
      await updateDoc(ref(item.id), { ...fields, updatedAt: serverTimestamp() });
    },
    async removeVariant(item, variantId) {
      await migrate(item);
      await updateDoc(ref(item.id), { [`variants.${variantId}`]: deleteField(), updatedAt: serverTimestamp() });
    },
    async logMovement(m) {
      const u = auth.currentUser;
      await addDoc(movements, {
        ...clean(m),
        at: Date.now(),
        by: u?.displayName?.split(' ')[0] ?? u?.email ?? 'Inconnu',
        uid: u?.uid ?? null,
      });
    },
    subscribeHistory(cb) {
      // Les 2000 derniers mouvements suffisent pour l'écran et les stats sur plusieurs mois.
      return onSnapshot(query(movements, orderBy('at', 'desc'), limit(2000)), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Movement, 'id'>) }))),
      );
    },
    async importItems(list) {
      for (const input of list) await this.create(input);
    },
  };
}
