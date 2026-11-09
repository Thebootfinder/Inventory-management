import { useEffect, useState } from 'react';

/**
 * Installation de l'app sur l'écran d'accueil (PWA).
 * - Android / Chrome / Edge : le navigateur émet `beforeinstallprompt`, qu'on garde pour
 *   afficher l'invite native au clic sur « Installer ».
 * - iPhone / iPad : pas d'invite automatique, on explique « Partager › Sur l'écran d'accueil ».
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Écouté dès le chargement du module : l'événement peut arriver avant l'affichage de l'app.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try {
      localStorage.setItem('cellier.installed', '1');
    } catch {
      /* ignore */
    }
    notify();
  });
}

export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  // Les iPad récents se présentent comme un Mac : on les reconnaît à l'écran tactile.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export function isInstalled() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const platform = detectPlatform();
  return {
    installed: isInstalled(),
    platform,
    /** Vrai quand le navigateur propose son invite d'installation native. */
    canPrompt: !!deferred,
    async prompt() {
      const e = deferred;
      if (!e) return false;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      notify();
      return outcome === 'accepted';
    },
  };
}
