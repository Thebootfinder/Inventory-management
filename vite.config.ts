/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Génère `sw.js` à chaque build avec un identifiant de version et la liste des fichiers de l'app :
 * le service worker met tout en cache dès l'installation, et le navigateur repère chaque nouvelle version.
 */
function serviceWorker(): Plugin {
  return {
    name: 'cellier-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f.startsWith('assets/') && !f.endsWith('.map'))
        // En mode local, Firebase n'est jamais chargé : inutile de le télécharger d'avance.
        .filter((f) => process.env.VITE_FIREBASE_API_KEY || !f.startsWith('assets/firebase'))
        .map((f) => `./${f}`);
      const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replaceAll('__BUILD_ID__', Date.now().toString(36))
        .replaceAll('__ASSETS__', JSON.stringify(assets));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// base relatif : fonctionne sur GitHub Pages (sous-dossier) comme à la racine d'un domaine.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    // Firebase (≈ 640 Ko) et le lecteur de codes-barres (≈ 450 Ko) sont chargés à part, à la demande.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // React à part : il change rarement, le cache du téléphone le garde d'une version à l'autre.
        manualChunks: { react: ['react', 'react-dom'] },
      },
    },
  },
  test: {
    environment: 'node',
  },
});
