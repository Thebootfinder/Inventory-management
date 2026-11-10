import { useState } from 'react';
import { useInstall } from '../install';
import { Icon } from './Icon';
import '../install.css';

/** Encart « Installer l'app », dans les Réglages. Invisible si l'app est déjà installée. */
export function InstallCard({ notify }: { notify: (t: string) => void }) {
  const { installed, platform, canPrompt, prompt } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;

  return (
    <div className="card install-card">
      <div className="install-head">
        <img src="./icon.svg" alt="" width={44} height={44} />
        <div>
          <p className="backup-title">Installer l’app sur le téléphone</p>
          <p className="muted">Une icône sur l’écran d’accueil, en plein écran, sans barre du navigateur.</p>
        </div>
      </div>

      {canPrompt ? (
        <button
          className="btn primary"
          onClick={async () => {
            if (await prompt()) notify('App installée sur l’écran d’accueil');
          }}
        >
          <Icon name="download" size={18} /> Installer
        </button>
      ) : (
        <button className="btn ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
          <Icon name="download" size={18} /> Comment l’installer ?
        </button>
      )}

      {help && !canPrompt && <InstallSteps platform={platform} />}
    </div>
  );
}

/** Petit bouton discret dans l'en-tête, qui mène aux Réglages. */
export function InstallChip({ onClick }: { onClick: () => void }) {
  const { installed } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('cellier.install.hidden') === '1';
    } catch {
      return false;
    }
  });
  if (installed || hidden) return null;
  return (
    <span className="install-chip">
      <button onClick={onClick}>
        <Icon name="download" size={14} /> Installer
      </button>
      <button
        className="install-chip-x"
        aria-label="Masquer"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('cellier.install.hidden', '1');
          } catch {
            /* ignore */
          }
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </span>
  );
}

function InstallSteps({ platform }: { platform: 'ios' | 'android' | 'other' }) {
  if (platform === 'ios')
    return (
      <ol className="install-steps">
        <li>
          Ouvrez cette page dans <b>Safari</b>.
        </li>
        <li>
          Touchez <b>Partager</b> <ShareIcon /> en bas de l’écran.
        </li>
        <li>
          Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.
        </li>
      </ol>
    );
  if (platform === 'android')
    return (
      <ol className="install-steps">
        <li>
          Ouvrez le menu <b>⋮</b> du navigateur (en haut à droite).
        </li>
        <li>
          Choisissez <b>Installer l’application</b> ou <b>Ajouter à l’écran d’accueil</b>.
        </li>
        <li>Confirmez : l’icône Cellier apparaît avec vos autres applis.</li>
      </ol>
    );
  return (
    <p className="install-steps">
      Ouvrez cette adresse sur votre téléphone, puis revenez ici : le bouton d’installation s’affichera.
    </p>
  );
}

function ShareIcon() {
  return (
    <svg className="inline-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="icône Partager">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v8h14v-8" />
    </svg>
  );
}
