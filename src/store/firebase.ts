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
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { planRestore } from '../lib/backup';
import { fromLegacy, newId, sortVariants, totalOf, type Item, type ItemInput, type Movement, type Variant } from '../types';
import type { InventoryStore, ShoppingLine, ShoppingState } from './types';

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
  const shoppingDoc = doc(db, 'shared', 'courses');
  const ref = (id: string) => doc(items, id);

  // ---- Écritures sans attente ----
  // Firestore applique une écriture au cache local immédiatement, mais sa promesse ne se résout qu'à la
  // confirmation du serveur : hors-ligne, l'attendre bloquerait l'écran. On la suit donc en arrière-plan.
  let pending = 0;
  const pendingListeners = new Set<(n: number) => void>();
  const errorListeners = new Set<(e: Error) => void>();
  const setPending = (n: number) => {
    pending = n;
    pendingListeners.forEach((cb) => cb(n));
  };
  function track(p: Promise<unknown>) {
    setPending(pending + 1);
    p.catch((e: Error) => errorListeners.forEach((cb) => cb(e))).finally(() => setPending(pending - 1));
  }

  /** Convertit un document de l'ancien format avant d'y toucher. */
  function migrate(item: Item) {
    if (!item.legacy) return;
    track(
      updateDoc(ref(item.id), {
        variants: variantsToMap(item.variants),
        quantity: deleteField(),
        barcode: deleteField(),
        imageUrl: deleteField(),
      }),
    );
  }

  /**
   * Deux téléphones qui retirent la dernière bouteille en même temps font passer la quantité à −1 sur le serveur
   * (chacun envoie « −1 »). On remet ces quantités à 0 dans une transaction, qui relit la valeur serveur :
   * si deux téléphones corrigent en même temps, un seul l'applique.
   */
  const healing = new Set<string>();
  function healNegative(id: string, variantIds: string[]) {
    if (healing.has(id)) return;
    healing.add(id);
    runTransaction(db, async (tx) => {
      const snap = await tx.get(ref(id));
      const vs = (snap.data()?.variants ?? {}) as Record<string, { quantity?: number }>;
      const fix = Object.fromEntries(
        variantIds.filter((v) => Number(vs[v]?.quantity) < 0).map((v) => [`variants.${v}.quantity`, 0]),
      );
      if (Object.keys(fix).length) tx.update(ref(id), fix);
    })
      .catch(() => {
        /* hors-ligne : on réessaiera au prochain instantané */
      })
      .finally(() => healing.delete(id));
  }

  function currentName() {
    const u = auth.currentUser;
    return u?.displayName?.split(' ')[0] ?? u?.email ?? 'Inconnu';
  }

  function toDoc(input: ItemInput) {
    const { variants, ...rest } = input;
    return { ...clean(rest), variants: variantsToMap(variants), updatedAt: serverTimestamp() };
  }

  const store: InventoryStore = {
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
              const raw = legacy ? null : (data.variants as Record<string, Omit<Variant, 'id'>>);
              if (raw && !snap.metadata.fromCache && !d.metadata.hasPendingWrites) {
                const negative = Object.entries(raw).filter(([, v]) => Number(v.quantity) < 0).map(([id]) => id);
                if (negative.length) healNegative(d.id, negative);
              }
              const variants = legacy
                ? fromLegacy(data)
                : sortVariants(
                    Object.entries(raw!).map(([id, v]) => ({
                      ...clean(v),
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
    async create(input, id) {
      // L'identifiant est créé sur le téléphone : pas besoin d'attendre le serveur pour le connaître.
      const target = id ? ref(id) : doc(items);
      track(setDoc(target, toDoc(input)));
      return target.id;
    },
    async update(id, patch) {
      track(updateDoc(ref(id), { ...clean(patch), updatedAt: serverTimestamp() }));
    },
    async remove(id) {
      track(deleteDoc(ref(id)));
    },
    async adjust(item, variantId, delta) {
      migrate(item);
      // Jamais plus que ce qu'on voit en stock ; increment() reste atomique entre téléphones.
      const current = item.variants.find((v) => v.id === variantId)?.quantity ?? 0;
      const d = delta < 0 ? -Math.min(-delta, current) : delta;
      if (!d) return;
      track(updateDoc(ref(item.id), { [`variants.${variantId}.quantity`]: increment(d), updatedAt: serverTimestamp() }));
    },
    async addVariant(item, variant) {
      migrate(item);
      const { id, ...v } = variant;
      track(updateDoc(ref(item.id), { [`variants.${id}`]: clean(v), updatedAt: serverTimestamp() }));
    },
    async updateVariant(item, variantId, patch) {
      migrate(item);
      const fields = Object.fromEntries(
        Object.entries(patch).map(([k, v]) => [`variants.${variantId}.${k}`, v === undefined ? deleteField() : v]),
      );
      track(updateDoc(ref(item.id), { ...fields, updatedAt: serverTimestamp() }));
    },
    async removeVariant(item, variantId) {
      migrate(item);
      track(updateDoc(ref(item.id), { [`variants.${variantId}`]: deleteField(), updatedAt: serverTimestamp() }));
    },
    async logMovement(m) {
      const u = auth.currentUser;
      track(
        setDoc(doc(movements, newId()), {
          ...clean(m),
          // `at` (heure du téléphone) sert au tri et marche hors-ligne ; `serverAt` fait foi en cas de doute.
          at: Date.now(),
          serverAt: serverTimestamp(),
          by: currentName(),
          uid: u?.uid ?? null,
        }),
      );
    },
    subscribeHistory(cb, since) {
      return onSnapshot(query(movements, where('at', '>=', since), orderBy('at', 'desc')), (snap) =>
        cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Movement, 'id'>) }))),
      );
    },
    async importItems(list, mode, current) {
      const plan = planRestore(current, list, mode);
      // Un lot Firestore accepte 500 écritures.
      let batch = writeBatch(db);
      let n = 0;
      const flush = () => {
        track(batch.commit());
        batch = writeBatch(db);
        n = 0;
      };
      const add = (fn: () => void) => {
        fn();
        if (++n >= 450) flush();
      };
      const now = new Set(current.map((i) => i.id));
      for (const id of plan.deletes) add(() => batch.delete(ref(id)));
      for (const u of plan.updates) add(() => batch.set(ref(u.id), toDoc(u.input)));
      for (const c of plan.creates) {
        const target = c.id && (mode === 'replace' || !now.has(c.id)) ? ref(c.id) : doc(items);
        add(() => batch.set(target, toDoc(c.input)));
      }
      if (n) flush();
    },
    async importHistory(list) {
      // Les règles n'autorisent que l'ajout : une ligne déjà présente est refusée, ce qui est voulu.
      const uid = auth.currentUser?.uid ?? null;
      for (const m of list) {
        const { id, ...rest } = m;
        setDoc(doc(movements, id), { ...clean(rest), uid }).catch(() => {});
      }
    },
    subscribeShopping(cb) {
      return onSnapshot(shoppingDoc, (snap) => {
        const data = snap.data() as Partial<ShoppingState> | undefined;
        latestShopping = { extras: Array.isArray(data?.extras) ? data!.extras : [], checked: data?.checked ?? {} };
        cb(latestShopping);
      });
    },
    async setShopping(fn) {
      // On n'envoie que ce qui change : deux personnes qui cochent en même temps ne s'écrasent pas.
      const before = latestShopping;
      const after = fn(before);
      const checked: Record<string, ShoppingLine | ReturnType<typeof deleteField>> = {};
      for (const id of new Set([...Object.keys(before.checked), ...Object.keys(after.checked)])) {
        const a = before.checked[id];
        const b = after.checked[id];
        if (!b) checked[id] = deleteField();
        else if (JSON.stringify(a) !== JSON.stringify(b)) checked[id] = clean(b);
      }
      const added = after.extras.filter((id) => !before.extras.includes(id));
      const removed = before.extras.filter((id) => !after.extras.includes(id));
      latestShopping = after;
      const base: Record<string, unknown> = {};
      if (Object.keys(checked).length) base.checked = checked;
      if (added.length) base.extras = arrayUnion(...added);
      if (Object.keys(base).length) track(setDoc(shoppingDoc, base, { merge: true }));
      if (removed.length) track(setDoc(shoppingDoc, { extras: arrayRemove(...removed) }, { merge: true }));
    },
    onPending(cb) {
      pendingListeners.add(cb);
      cb(pending);
      return () => pendingListeners.delete(cb);
    },
    onWriteError(cb) {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    },
    currentName,
  };
  let latestShopping: ShoppingState = { extras: [], checked: {} };
  return store;
}
