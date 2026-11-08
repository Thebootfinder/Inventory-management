import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { store, type User } from './store';
import { stockLevel, type Item, type ItemInput } from './types';
import { Icon, ItemThumb } from './components/Icon';
import { ItemRow } from './components/ItemRow';
import { ItemSheet } from './components/ItemSheet';
import { ScanView, type ScanMode } from './components/ScanView';

type View = 'stock' | 'alerts';
type Panel = { kind: 'new'; barcode?: string } | { kind: 'edit'; id: string } | { kind: 'scan' } | null;
interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState<View>('stock');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('Tout');
  const [panel, setPanel] = useState<Panel>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('out');
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => store.onUser(setUser), []);

  useEffect(() => {
    if (!user) return;
    return store.subscribe(
      (list) => {
        setItems(list);
        setError(null);
      },
      (e) =>
        setError(
          e.message.includes('permission')
            ? 'Accès refusé : ce compte n’est pas autorisé sur l’inventaire.'
            : 'Synchronisation interrompue. Nouvelle tentative…',
        ),
    );
  }, [user]);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((text: string, action?: Toast['action']) => setToast({ id: Date.now(), text, action }), []);
  const fail = useCallback((e: unknown) => notify(`Erreur : ${(e as Error).message ?? e}`), [notify]);

  const all = items ?? [];
  const sorted = useMemo(() => [...all].sort((a, b) => collator.compare(a.name, b.name)), [all]);
  const alerts = useMemo(
    () =>
      sorted
        .filter((i) => stockLevel(i) !== 'ok')
        .sort((a, b) => a.quantity / Math.max(1, a.target) - b.quantity / Math.max(1, b.target)),
    [sorted],
  );
  const categories = useMemo(() => Array.from(new Set(all.map((i) => i.category))).sort(collator.compare), [all]);
  const locations = useMemo(
    () => Array.from(new Set(all.map((i) => i.location).filter(Boolean) as string[])).sort(collator.compare),
    [all],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return sorted.filter(
      (i) =>
        (category === 'Tout' || i.category === category) &&
        (!q || normalize(`${i.name} ${i.location ?? ''} ${i.category}`).includes(q) || i.barcode === query.trim()),
    );
  }, [sorted, query, category]);

  const totalUnits = all.reduce((n, i) => n + i.quantity, 0);

  const adjust = useCallback(
    (item: Item, delta: number) => {
      if (delta < 0 && item.quantity + delta < 0) return;
      store.adjust(item.id, delta).catch(fail);
      const next = item.quantity + delta;
      if (delta < 0 && item.target > 0 && next < item.target && item.quantity >= item.target) {
        notify(next === 0 ? `${item.name} : rupture de stock` : `${item.name} passe sous le seuil (${next}/${item.target})`);
      }
    },
    [fail, notify],
  );

  const save = async (input: ItemInput) => {
    if (panel?.kind === 'edit') {
      await store.update(panel.id, input).catch(fail);
      notify('Article mis à jour');
    } else {
      await store.create(input).catch(fail);
      notify(`${input.name} ajouté`);
    }
    setPanel(null);
  };

  const remove = async (item: Item) => {
    setPanel(null);
    await store.remove(item.id).catch(fail);
    const { id: _id, updatedAt: _u, ...rest } = item;
    notify(`${item.name} supprimé`, { label: 'Annuler', run: () => store.create(rest).catch(fail) });
  };

  const shareList = async () => {
    const text =
      'À racheter :\n' +
      alerts.map((i) => `• ${i.name} — ${Math.max(1, i.target - i.quantity)} ${i.unit} (reste ${i.quantity})`).join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses du cellier', text });
      else {
        await navigator.clipboard.writeText(text);
        notify('Liste copiée');
      }
    } catch {
      /* partage annulé */
    }
  };

  if (user === undefined) return <Splash />;
  if (user === null) return <Login onSignIn={() => store.signIn().catch(fail)} />;

  const editing = panel?.kind === 'edit' ? all.find((i) => i.id === panel.id) : undefined;

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <div>
            <p className="eyebrow">Inventaire</p>
            <h1>Cellier</h1>
          </div>
          <SyncBadge mode={store.mode} online={online} user={user} />
        </div>

        <div className="stats">
          <button className={`stat${view === 'stock' && category === 'Tout' ? ' on' : ''}`} onClick={() => { setView('stock'); setCategory('Tout'); }}>
            <strong>{all.length}</strong>
            <span>articles</span>
          </button>
          <div className="stat">
            <strong>{totalUnits}</strong>
            <span>unités</span>
          </div>
          <button className={`stat alert${alerts.length ? ' hot' : ''}${view === 'alerts' ? ' on' : ''}`} onClick={() => setView('alerts')}>
            <strong>{alerts.length}</strong>
            <span>en alerte</span>
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {store.mode === 'local' && (
        <div className="banner info">
          <Icon name="device" size={16} /> Mode local : les données restent sur cet appareil. Configurez Firebase pour partager
          en temps réel.
        </div>
      )}

      <main>
        {view === 'stock' ? (
          <>
            <div className="toolbar">
              <div className="search-row">
                <label className="search">
                  <Icon name="search" size={18} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher…"
                    enterKeyHint="search"
                  />
                </label>
                <button className="add-btn" onClick={() => setPanel({ kind: 'new' })} aria-label="Ajouter un article">
                  <Icon name="plus" size={22} />
                </button>
              </div>
              {categories.length > 1 && (
                <div className="chips scroll">
                  {['Tout', ...categories].map((c) => (
                    <button key={c} className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items === null ? (
              <SkeletonList />
            ) : visible.length ? (
              <ul className="list">
                {visible.map((item) => (
                  <ItemRow key={item.id} item={item} onOpen={() => setPanel({ kind: 'edit', id: item.id })} onAdjust={(d) => adjust(item, d)} />
                ))}
              </ul>
            ) : all.length ? (
              <Empty title="Aucun résultat" text="Essayez un autre mot ou une autre catégorie." />
            ) : (
              <Empty
                title="Le cellier est vide"
                text="Scannez le code-barres d’une bouteille ou ajoutez un article à la main."
                action={
                  <button className="btn primary" onClick={() => setPanel({ kind: 'new' })}>
                    <Icon name="plus" size={18} /> Ajouter un article
                  </button>
                }
              />
            )}
          </>
        ) : (
          <section>
            <div className="section-head">
              <h2>À racheter</h2>
              {alerts.length > 0 && (
                <button className="btn small" onClick={shareList}>
                  <Icon name="share" size={16} /> Partager
                </button>
              )}
            </div>
            {alerts.length ? (
              <ul className="list">
                {alerts.map((i) => (
                  <li key={i.id} className={`row level-${stockLevel(i)}`}>
                    <button className="row-main" onClick={() => setPanel({ kind: 'edit', id: i.id })}>
                      <ItemThumb category={i.category} imageUrl={i.imageUrl} />
                      <div className="row-text">
                        <div className="row-name">{i.name}</div>
                        <div className="row-meta">
                          <span className={`pill ${stockLevel(i)}`}>{i.quantity === 0 ? 'Rupture' : `Reste ${i.quantity}`}</span>
                          <span>seuil {i.target}</span>
                        </div>
                      </div>
                    </button>
                    <div className="need">
                      <span>Acheter</span>
                      <strong>{Math.max(1, i.target - i.quantity)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="Tout est en stock" text="Aucun article n’est sous son seuil d’alerte. 🎉" />
            )}
          </section>
        )}
      </main>

      <nav className="tabbar">
        <button className={view === 'stock' ? 'on' : ''} onClick={() => setView('stock')}>
          <Icon name="box" />
          <span>Stock</span>
        </button>
        <button className="fab" onClick={() => setPanel({ kind: 'scan' })} aria-label="Scanner un code-barres">
          <Icon name="scan" size={28} />
        </button>
        <button className={view === 'alerts' ? 'on' : ''} onClick={() => setView('alerts')}>
          <span className="tab-icon">
            <Icon name="alert" />
            {alerts.length > 0 && <b className="badge">{alerts.length}</b>}
          </span>
          <span>À racheter</span>
        </button>
      </nav>

      {panel?.kind === 'scan' && (
        <ScanView
          items={all}
          initialMode={scanMode}
          onClose={(m) => {
            setScanMode(m);
            setPanel(null);
          }}
          onAdjust={adjust}
          onFound={(item) => setPanel({ kind: 'edit', id: item.id })}
          onUnknown={(code) => {
            setPanel({ kind: 'new', barcode: code });
          }}
        />
      )}

      {(panel?.kind === 'new' || editing) && (
        <ItemSheet
          key={panel?.kind === 'edit' ? panel.id : `new-${panel?.kind === 'new' ? panel.barcode : ''}`}
          item={editing}
          barcode={panel?.kind === 'new' ? panel.barcode : undefined}
          categories={categories}
          locations={locations}
          onClose={() => setPanel(null)}
          onSave={save}
          onDelete={editing ? () => remove(editing) : undefined}
          onAdjust={editing ? (d) => adjust(editing, d) : undefined}
        />
      )}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SyncBadge({ mode, online, user }: { mode: 'cloud' | 'local'; online: boolean; user: User }) {
  const [open, setOpen] = useState(false);
  const label = mode === 'local' ? 'Local' : online ? 'Synchro' : 'Hors-ligne';
  return (
    <div className="sync-wrap">
      <button className={`sync ${mode === 'local' ? 'local' : online ? 'live' : 'off'}`} onClick={() => setOpen((o) => !o)}>
        <i />
        {label}
      </button>
      {open && (
        <div className="sync-pop" onClick={() => setOpen(false)}>
          <p>
            {mode === 'local'
              ? 'Données enregistrées sur ce téléphone uniquement.'
              : online
                ? 'Connecté : les changements apparaissent en direct sur tous les téléphones.'
                : 'Hors-ligne : vos changements sont gardés et envoyés au retour du réseau.'}
          </p>
          {mode === 'cloud' && (
            <button className="btn small ghost" onClick={() => store.signOut()}>
              <Icon name="logout" size={16} /> Déconnexion ({user.email ?? user.name})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Splash() {
  return (
    <div className="center-screen">
      <img src="./icon.svg" alt="" width={72} height={72} className="pulse" />
    </div>
  );
}

function Login({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="center-screen login">
      <img src="./icon.svg" alt="" width={84} height={84} />
      <h1>Cellier</h1>
      <p>L’inventaire partagé de votre cellier, à jour en temps réel sur tous vos téléphones.</p>
      <button className="btn primary wide" onClick={onSignIn}>
        Se connecter avec Google
      </button>
    </div>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-art">
        <Icon name="box" size={30} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="list">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="row skeleton" />
      ))}
    </ul>
  );
}
