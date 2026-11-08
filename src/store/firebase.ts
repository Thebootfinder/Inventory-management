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
  doc,
  increment,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import type { Item, ItemInput } from '../types';
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

export function createFirebaseStore(config: FirebaseConfig): InventoryStore {
  const app = initializeApp(config);
  const auth = getAuth(app);
  // Cache persistant : l'app reste utilisable hors-ligne (au fond du cellier, sans réseau)
  // et renvoie les modifications dès que la connexion revient.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const items = collection(db, 'items');

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
              return {
                id: d.id,
                name: data.name ?? '',
                barcode: data.barcode || undefined,
                category: data.category ?? 'Autre',
                location: data.location || undefined,
                quantity: Math.max(0, Number(data.quantity) || 0),
                target: Number(data.target) || 0,
                unit: data.unit ?? 'pcs',
                imageUrl: data.imageUrl || undefined,
                updatedAt: ts?.toMillis?.() ?? Date.now(),
              } satisfies Item;
            }),
          );
        },
        (err) => onError(err),
      );
    },
    async create(input: ItemInput) {
      const ref = await addDoc(items, { ...clean(input), updatedAt: serverTimestamp() });
      return ref.id;
    },
    async update(id, patch) {
      await updateDoc(doc(items, id), { ...clean(patch), updatedAt: serverTimestamp() });
    },
    async adjust(id, delta) {
      // increment() est atomique : deux personnes qui scannent en même temps ne s'écrasent pas.
      await updateDoc(doc(items, id), { quantity: increment(delta), updatedAt: serverTimestamp() });
    },
    async remove(id) {
      await deleteDoc(doc(items, id));
    },
  };
}
