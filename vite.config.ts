import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base relatif : fonctionne sur GitHub Pages (sous-dossier) comme à la racine d'un domaine.
export default defineConfig({
  base: './',
  plugins: [react()],
});
