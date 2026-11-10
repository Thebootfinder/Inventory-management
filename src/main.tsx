import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initStore } from './store';
import { registerServiceWorker } from './update';
import './styles.css';
import './install';

registerServiceWorker();

// En mode cloud, Firebase est chargé avant le premier affichage ; en mode local, rien à attendre.
initStore().finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
