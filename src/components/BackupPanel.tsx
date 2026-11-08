import { useRef, useState } from 'react';
import { store } from '../store';
import type { Item, ItemInput } from '../types';
import { Icon } from './Icon';

interface Backup {
  app: 'cellier';
  version: 2;
  exportedAt: string;
  items: ItemInput[];
}

/** Sauvegarde / restauration de l'inventaire dans un fichier, à garder où l'on veut. */
export function BackupPanel({ items, replaces, onDone }: { items: Item[]; replaces: boolean; onDone: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<ItemInput[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportFile = async () => {
    const data: Backup = {
      app: 'cellier',
      version: 2,
      exportedAt: new Date().toISOString(),
      items: items.map(({ name, category, location, target, unit, variants }) => ({ name, category, location, target, unit, variants })),
    };
    const date = new Date().toISOString().slice(0, 10);
    const file = new File([JSON.stringify(data, null, 2)], `cellier-sauvegarde-${date}.json`, { type: 'application/json' });
    // Sur téléphone, la feuille de partage permet d'enregistrer dans Fichiers, Drive, ou de l'envoyer par mail.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Sauvegarde du cellier' });
        onDone('Sauvegarde exportée');
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onDone('Sauvegarde téléchargée');
  };

  const readFile = async (f: File) => {
    setError(null);
    try {
      const data = JSON.parse(await f.text()) as Partial<Backup> | ItemInput[];
      const list = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(list) || list.some((i) => typeof i?.name !== 'string')) throw new Error();
      setPendingRestore(list);
    } catch {
      setError('Ce fichier n’est pas une sauvegarde du cellier.');
    }
  };

  return (
    <div className="backup">
      <p className="backup-title">Sauvegarde</p>
      {pendingRestore ? (
        <>
          <p>
            {replaces
              ? `Remplacer l’inventaire actuel (${items.length} articles) par celui de la sauvegarde (${pendingRestore.length} articles) ?`
              : `Ajouter les ${pendingRestore.length} articles de la sauvegarde à l’inventaire partagé ?`}
          </p>
          <div className="backup-actions">
            <button className="btn small ghost" onClick={() => setPendingRestore(null)}>
              Annuler
            </button>
            <button
              className="btn small primary"
              onClick={async () => {
                await store.importItems(pendingRestore);
                setPendingRestore(null);
                onDone('Sauvegarde restaurée');
              }}
            >
              Restaurer
            </button>
          </div>
        </>
      ) : (
        <div className="backup-actions">
          <button className="btn small ghost" onClick={exportFile} disabled={!items.length}>
            <Icon name="download" size={16} /> Exporter
          </button>
          <button className="btn small ghost" onClick={() => input.current?.click()}>
            <Icon name="upload" size={16} /> Restaurer
          </button>
        </div>
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
