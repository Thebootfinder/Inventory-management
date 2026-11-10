import { useEffect, useState } from 'react';

/**
 * Mise à jour de l'app installée.
 * Le service worker d'une nouvelle version s'installe en arrière-plan puis attend : on propose alors
 * « Recharger », qui l'active et recharge la page. Sans cela, un téléphone pourrait garder une vieille version.
 */
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => {
          // Une version « installed » alors qu'une autre contrôle déjà la page = mise à jour prête.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = sw;
            notify();
          }
        };
        check();
        sw.addEventListener('statechange', check);
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Vérifie les nouvelles versions au retour sur l'app (une PWA reste ouverte des jours).
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {
      /* navigation privée, etc. */
    }
  });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !waiting) return;
    reloading = true;
    window.location.reload();
  });
}

export function applyUpdate() {
  waiting?.postMessage('skip-waiting');
}

export function useUpdateReady() {
  const [ready, setReady] = useState(Boolean(waiting));
  useEffect(() => {
    const l = () => setReady(Boolean(waiting));
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return ready;
}
