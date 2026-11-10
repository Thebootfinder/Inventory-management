// Service worker du cellier. L'identifiant de version et la liste des fichiers sont remplis au build (vite.config.ts) :
// chaque déploiement produit donc un fichier différent, que le navigateur détecte comme une mise à jour.
const BUILD = '__BUILD_ID__';
const ASSETS = __ASSETS__;
const CACHE = `cellier-${BUILD}`;
const IMAGES = 'cellier-images';
const IMAGES_MAX = 300;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(['./', './index.html', ...ASSETS]);
      // Première installation : on prend la main tout de suite. Mise à jour : on attend que l'utilisateur
      // appuie sur « Recharger » (message « skip-waiting »), pour ne pas changer l'app sous ses doigts.
      if (!self.registration.active) self.skipWaiting();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE && k !== IMAGES).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Réseau d'abord, mais pas plus de 3 s : au fond du cellier, un réseau faible ne doit pas bloquer l'ouverture. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreVary: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

/** Fichiers versionnés (nom avec empreinte) : ils ne changent jamais, le cache suffit. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    cache.put(req, res.clone());
    if (cacheName === IMAGES) trim(cache);
  }
  return res;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - IMAGES_MAX))) await cache.delete(k);
}

/** Petits fichiers non versionnés (icônes, manifeste) : réponse immédiate du cache, rafraîchie en arrière-plan. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Vignettes Open Food Facts : gardées pour s'afficher hors-ligne.
  if (url.hostname.endsWith('openfoodfacts.org') && url.hostname.startsWith('images')) {
    event.respondWith(cacheFirst(req, IMAGES));
    return;
  }
  // Firebase, API Open Food Facts… passent directement.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html')) event.respondWith(networkFirst(req));
  else if (url.pathname.includes('/assets/')) event.respondWith(cacheFirst(req, CACHE));
  else event.respondWith(staleWhileRevalidate(req));
});
