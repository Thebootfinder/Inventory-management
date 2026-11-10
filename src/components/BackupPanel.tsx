import { useRef, useState } from 'react';
import { store, type RestoreMode } from '../store';
import { makeBackup, parseBackup, type ParsedBackup } from '../lib/backup';
import { historyCsv, inventoryCsv, saveFile } from '../lib/csv';
import { daysSinceBackup, markBackup } from '../lib/prefs';
import type { Item, Movement } from '../types';
import { Icon } from './Icon';

const today = () => new Date().toISOString().slice(0, 10);

/** Sauvegarde / restauration de l'inventaire et de l'historique, et export tableur. */
export function BackupPanel({ items, history, onDone }: { items: Item[]; history: Movement[] | null; onDone: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<ParsedBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const age = daysSinceBackup();

  const exportFile = async () => {
    const data = makeBackup(items, history ?? []);
    const file = new File([JSON.stringify(data, null, 2)], `cellier-sauvegarde-${today()}.json`, { type: 'application/json' });
    // Sur téléphone, la feuille de partage permet d'enregistrer dans Fichiers, Drive, ou de l'envoyer par mail.
    if (await saveFile(file)) {
      markBackup();
      onDone('Sauvegarde exportée');
    }
  };

  const exportCsv = async (kind: 'stock' | 'history') => {
    const text = kind === 'stock' ? inventoryCsv(items) : historyCsv(history ?? []);
    const file = new File([text], `cellier-${kind === 'stock' ? 'inventaire' : 'historique'}-${today()}.csv`, { type: 'text/csv' });
    if (await saveFile(file)) onDone('Fichier tableur exporté');
  };

  const readFile = async (f: File) => {
    setError(null);
    try {
      setPendingRestore(parseBackup(await f.text()));
    } catch {
      setError('Ce fichier n’est pas une sauvegarde du cellier.');
    }
  };

  const restore = async (mode: RestoreMode) => {
    if (!pendingRestore || busy) return;
    setBusy(true);
    try {
      await store.importItems(pendingRestore.items, mode, items);
      if (pendingRestore.history.length) await store.importHistory(pendingRestore.history);
      setPendingRestore(null);
      onDone('Sauvegarde restaurée');
    } catch (e) {
      setError(`La restauration a échoué : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="backup">
      <p className="backup-title">Sauvegarde</p>
      <p className="muted small">
        {age === null ? 'Aucune sauvegarde exportée depuis ce téléphone.' : age === 0 ? 'Dernière sauvegarde : aujourd’hui.' : `Dernière sauvegarde : il y a ${age} jour${age > 1 ? 's' : ''}.`}{' '}
        Le fichier contient l’inventaire et tout l’historique.
      </p>
      {pendingRestore ? (
        <>
          <p>
            La sauvegarde contient {pendingRestore.items.length} articles
            {pendingRestore.history.length ? ` et ${pendingRestore.history.length} mouvements` : ''}. L’inventaire actuel en compte {items.length}.
          </p>
          <div className="backup-actions col">
            <button className="btn small primary" disabled={busy} onClick={() => restore('merge')}>
              Fusionner (met à jour les articles existants, ajoute les autres)
            </button>
            <button className="btn small danger" disabled={busy} onClick={() => restore('replace')}>
              Remplacer tout l’inventaire
            </button>
            <button className="btn small ghost" disabled={busy} onClick={() => setPendingRestore(null)}>
              Annuler
            </button>
          </div>
          {busy && <p className="muted small">Restauration en cours…</p>}
        </>
      ) : (
        <>
          <div className="backup-actions">
            <button className="btn small ghost" onClick={exportFile} disabled={!items.length || history === null}>
              <Icon name="download" size={16} /> Exporter
            </button>
            <button className="btn small ghost" onClick={() => input.current?.click()}>
              <Icon name="upload" size={16} /> Restaurer
            </button>
          </div>
          <p className="backup-title sub">Tableur (Excel, Google Sheets)</p>
          <div className="backup-actions">
            <button className="btn small ghost" onClick={() => exportCsv('stock')} disabled={!items.length}>
              <Icon name="download" size={16} /> Inventaire CSV
            </button>
            <button className="btn small ghost" onClick={() => exportCsv('history')} disabled={!history?.length}>
              <Icon name="download" size={16} /> Historique CSV
            </button>
          </div>
        </>
      )}
      {error && <p className="danger-text">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) readFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
