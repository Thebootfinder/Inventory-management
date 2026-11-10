import { localStore } from './local';
import type { InventoryStore } from './types';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const cloudConfigured = Boolean(config.apiKey && config.projectId && config.appId && config.authDomain);

/**
 * Source de données active. En mode local, Firebase (≈ 600 Ko) n'est jamais téléchargé :
 * il n'est chargé qu'à la demande, quand la configuration est présente.
 */
export let store: InventoryStore = localStore;

export async function initStore() {
  if (!cloudConfigured) return;
  const { createFirebaseStore } = await import('./firebase');
  store = createFirebaseStore(config as Parameters<typeof createFirebaseStore>[0]);
}

export type { InventoryStore, User, ShoppingState, ShoppingLine, RestoreMode } from './types';
