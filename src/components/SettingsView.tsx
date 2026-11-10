import { useEffect, type ReactNode } from 'react';
import { store, type User } from '../store';
import { euro, stockValue, type Item, type Movement } from '../types';
import { BackupPanel } from './BackupPanel';
import { Icon } from './Icon';

export function SettingsView({
  user,
  online,
  pending,
  items,
  history,
  notify,
  loadHistory,
  install,
  onShowLocal,
}: {
  user: User;
  online: boolean;
  pending: number;
  items: Item[];
  history: Movement[] | null;
  notify: (t: string) => void;
  loadHistory: () => void;
  install: ReactNode;
  onShowLocal: () => void;
}) {
  const mode = store.mode;
  // La sauvegarde complète contient tout l'historique : on le charge en arrivant ici.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => loadHistory(), []);
  const { value, priced } = stockValue(items);
  const refs = items.reduce((n, i) => n + i.variants.length, 0);

  return (
    <section className="settings">
      <div className="section-head">
        <h2>Réglages</h2>
      </div>
      {install}
      <div className="card">
        <p className="backup-title">Synchronisation</p>
        <p>
          {mode === 'local'
            ? 'Mode local : les données sont enregistrées sur ce téléphone uniquement. Une mise à jour de l’app ne les efface pas, mais vider les données du navigateur, si. Pensez à exporter une sauvegarde de temps en temps.'
            : online
              ? pending
                ? `Connecté : ${pending} modification${pending > 1 ? 's' : ''} en cours d’envoi.`
                : 'Connecté : les changements apparaissent en direct sur tous les téléphones de la maison.'
              : pending
                ? `Hors-ligne : ${pending} modification${pending > 1 ? 's' : ''} en attente, envoyée${pending > 1 ? 's' : ''} au retour du réseau.`
                : 'Hors-ligne : vos changements sont gardés et envoyés au retour du réseau.'}
        </p>
        {mode === 'local' && (
          <button className="btn small ghost" onClick={onShowLocal}>
            <Icon name="device" size={16} /> Réafficher le bandeau « Mode local »
          </button>
        )}
        {mode === 'cloud' && (
          <button className="btn small ghost" onClick={() => store.signOut()}>
            <Icon name="logout" size={16} /> Déconnexion ({user.email ?? user.name})
          </button>
        )}
      </div>
      {priced > 0 && (
        <div className="card value-card">
          <p className="backup-title">Valeur du stock</p>
          <strong>{euro(value)}</strong>
          <p className="muted small">
            D’après le prix de {priced} référence{priced > 1 ? 's' : ''} sur {refs}. Le prix se met à jour quand vous le notez dans la
            liste de courses.
          </p>
        </div>
      )}
      <div className="card">
        <BackupPanel items={items} history={history} onDone={notify} />
      </div>
    </section>
  );
}
