import { createFirebaseStore } from './firebase';
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

export const store: InventoryStore =
  config.apiKey && config.projectId && config.appId && config.authDomain
    ? createFirebaseStore(config as Parameters<typeof createFirebaseStore>[0])
    : localStore;

export type { InventoryStore, User } from './types';
