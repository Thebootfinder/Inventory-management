import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { store, type User } from './store';
import { requestPersistentStorage } from './store/local';
import { stockLevel, totalOf, type Item, type ItemInput, type ItemPatch, type Movement, type MovementReason, type Variant } from './types';
import type { ProductInfo } from './scanner';
import { Icon } from './components/Icon';
import { ItemRow } from './components/ItemRow';
import { ItemSheet, type NewDraft } from './components/ItemSheet';
import { ScanView } from './components/ScanView';
import { BackupPanel } from './components/BackupPanel';
import { HistoryView } from './components/HistoryView';
import { ShoppingView } from './components/ShoppingView';

type View = 'stock' | 'courses' | 'history' | 'settings';
type Panel = { kind: 'new'; draft?: NewDraft } | { kind: 'edit'; id: string } | { kind: 'scan' } | null;
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [history, setHistory] = useState<Movement[] | null>(null);

  useEffect(() => store.onUser(setUser), []);
  useEffect(() => {
    if (store.mode === 'local') requestPersistentStorage();
  }, []);

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
    if (!user) return;
    return store.subscribeHistory(setHistory);
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
        (!q ||
          normalize(`${i.name} ${i.location ?? ''} ${i.category} ${i.variants.map((v) => v.label).join(' ')}`).includes(q) ||
          i.variants.some((v) => v.barcode === query.trim())),
    );
  }, [sorted, query, category]);

  const totalUnits = all.reduce((n, i) => n + i.quantity, 0);

  // Les appuis répétés sur +/− sont regroupés en une seule ligne d'historique.
  const pendingLog = useRef<{ key: string; m: Parameters<typeof store.logMovement>[0]; timer: number } | null>(null);
  const flushLog = useCallback(() => {
    const p = pendingLog.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingLog.current = null;
    if (p.m.delta !== 0) store.logMovement(p.m).catch(() => {});
  }, []);
  useEffect(() => {
    window.addEventListener('pagehide', flushLog);
    return () => window.removeEventListener('pagehide', flushLog);
  }, [flushLog]);

  const log = useCallback(
    (item: Pick<Item, 'id' | 'name' | 'category'>, variant: Pick<Variant, 'label'> | undefined, delta: number, reason: MovementReason) => {
      const m = { itemId: item.id, itemName: item.name, category: item.category, variantLabel: variant?.label.trim() || undefined, delta, reason };
      if (reason !== 'manuel') {
        flushLog();
        store.logMovement(m).catch(() => {});
        return;
      }
      const key = `${item.id}|${m.variantLabel ?? ''}|${Math.sign(delta)}`;
      const p = pendingLog.current;
      if (p && p.key === key) {
        clearTimeout(p.timer);
        p.m.delta += delta;
        p.timer = window.setTimeout(flushLog, 8000);
      } else {
        flushLog();
        pendingLog.current = { key, m, timer: window.setTimeout(flushLog, 8000) };
      }
    },
    [flushLog],
  );

  const adjust = useCallback(
    (item: Item, variantId: string, delta: number, reason: MovementReason = 'manuel') => {
      const variant = item.variants.find((v) => v.id === variantId);
      if (!variant || (delta < 0 && variant.quantity + delta < 0)) return;
      store.adjust(item, variantId, delta).catch(fail);
      log(item, item.variants.length > 1 ? variant : undefined, delta, reason);
      const next = item.quantity + delta;
      if (delta < 0 && item.target > 0 && next < item.target && item.quantity >= item.target) {
        notify(next === 0 ? `${item.name} : rupture de stock` : `${item.name} passe sous le seuil (${next}/${item.target})`);
      }
    },
    [fail, notify, log],
  );

  const create = async (input: ItemInput) => {
    const id = await store.create(input).catch(fail);
    const qty = totalOf(input.variants);
    if (id && qty > 0) log({ id, name: input.name, category: input.category }, input.variants[0], qty, 'création');
    notify(`${input.name} ajouté`);
    setPanel(null);
  };

  const update = async (id: string, patch: ItemPatch) => {
    await store.update(id, patch).catch(fail);
    notify('Article mis à jour');
    setPanel(null);
  };

  const remove = async (item: Item) => {
    setPanel(null);
    await store.remove(item.id).catch(fail);
    if (item.quantity > 0) log(item, undefined, -item.quantity, 'suppression');
    const { name, category, location, target, unit, variants } = item;
    notify(`${item.name} supprimé`, {
      label: 'Annuler',
      run: () => create({ name, category, location, target, unit, variants }),
    });
  };

  const restock = (lines: { item: Item; variantId: string; qty: number }[]) => {
    for (const l of lines) adjust(l.item, l.variantId, l.qty, 'courses');
    const n = lines.reduce((a, l) => a + l.qty, 0);
    notify(`${n} unité${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} en stock`);
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
          <SyncBadge mode={store.mode} online={online} onClick={() => setView('settings')} />
        </div>

        {view === 'stock' && (
        <div className="stats">
          <button className={`stat${view === 'stock' && category === 'Tout' ? ' on' : ''}`} onClick={() => { setView('stock'); setCategory('Tout'); }}>
            <strong>{all.length}</strong>
            <span>articles</span>
          </button>
          <div className="stat">
            <strong>{totalUnits}</strong>
            <span>unités</span>
          </div>
          <button className={`stat alert${alerts.length ? ' hot' : ''}`} onClick={() => setView('courses')}>
            <strong>{alerts.length}</strong>
            <span>en alerte</span>
          </button>
        </div>
        )}
      </header>

      {error && <div className="banner error">{error}</div>}
      {store.mode === 'local' && view === 'stock' && (
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
                  <ItemRow key={item.id} item={item} onOpen={() => setPanel({ kind: 'edit', id: item.id })} onAdjust={(d) => adjust(item, item.variants[0].id, d)} />
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
        ) : view === 'courses' ? (
          <ShoppingView items={all} onRestock={restock} onOpen={(item) => setPanel({ kind: 'edit', id: item.id })} notify={notify} />
        ) : view === 'history' ? (
          <HistoryView movements={history} />
        ) : (
          <SettingsView user={user} online={online} items={all} notify={notify} />
        )}
      </main>

      <nav className="tabbar">
        <button className={view === 'stock' ? 'on' : ''} onClick={() => setView('stock')}>
          <Icon name="box" />
          <span>Stock</span>
        </button>
        <button className={view === 'courses' ? 'on' : ''} onClick={() => setView('courses')}>
          <span className="tab-icon">
            <Icon name="cart" />
            {alerts.length > 0 && <b className="badge">{alerts.length}</b>}
          </span>
          <span>Courses</span>
        </button>
        <button className="fab" onClick={() => setPanel({ kind: 'scan' })} aria-label="Scanner un code-barres">
          <Icon name="scan" size={28} />
        </button>
        <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}>
          <Icon name="clock" />
          <span>Historique</span>
        </button>
        <button className={view === 'settings' ? 'on' : ''} onClick={() => setView('settings')}>
          <Icon name="gear" />
          <span>Réglages</span>
        </button>
      </nav>

      {panel?.kind === 'scan' && (
        <ScanView
          items={all}
          onClose={() => setPanel(null)}
          onAdjust={(item, vid, d) => adjust(item, vid, d, 'scan')}
          onOpen={(item) => setPanel({ kind: 'edit', id: item.id })}
          onCreate={(barcode: string, info: ProductInfo | null | undefined) => setPanel({ kind: 'new', draft: { barcode, info } })}
          onAddVariant={(item: Item, v: Variant) => store.addVariant(item, v).catch(fail)}
        />
      )}

      {(panel?.kind === 'new' || editing) && (
        <ItemSheet
          key={panel?.kind === 'edit' ? panel.id : `new-${panel?.kind === 'new' ? panel.draft?.barcode : ''}`}
          item={editing}
          draft={panel?.kind === 'new' ? panel.draft : undefined}
          categories={categories}
          locations={locations}
          onClose={() => setPanel(null)}
          onCreate={create}
          onUpdate={(patch) => update(editing!.id, patch)}
          onDelete={editing ? () => remove(editing) : undefined}
          onAdjust={editing ? (vid, d) => adjust(editing, vid, d) : undefined}
          onAddVariant={editing ? (v) => store.addVariant(editing, v).catch(fail) : undefined}
          onUpdateVariant={editing ? (vid, p) => store.updateVariant(editing, vid, p).catch(fail) : undefined}
          onRemoveVariant={editing ? (vid) => store.removeVariant(editing, vid).catch(fail) : undefined}
          historySlot={editing ? <HistoryView movements={(history ?? []).slice(0, 400)} itemId={editing.id} /> : undefined}
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

function SyncBadge({ mode, online, onClick }: { mode: 'cloud' | 'local'; online: boolean; onClick: () => void }) {
  const label = mode === 'local' ? 'Local' : online ? 'Synchro' : 'Hors-ligne';
  return (
    <button className={`sync ${mode === 'local' ? 'local' : online ? 'live' : 'off'}`} onClick={onClick}>
      <i />
      {label}
    </button>
  );
}

function SettingsView({ user, online, items, notify }: { user: User; online: boolean; items: Item[]; notify: (t: string) => void }) {
  const mode = store.mode;
  return (
    <section className="settings">
      <div className="section-head">
        <h2>Réglages</h2>
      </div>
      <div className="card">
        <p className="backup-title">Synchronisation</p>
        <p>
          {mode === 'local'
            ? 'Mode local : les données sont enregistrées sur ce téléphone uniquement. Une mise à jour de l’app ne les efface pas, mais vider les données du navigateur, si. Pensez à exporter une sauvegarde de temps en temps.'
            : online
              ? 'Connecté : les changements apparaissent en direct sur tous les téléphones de la maison.'
              : 'Hors-ligne : vos changements sont gardés et envoyés au retour du réseau.'}
        </p>
        {mode === 'cloud' && (
          <button className="btn small ghost" onClick={() => store.signOut()}>
            <Icon name="logout" size={16} /> Déconnexion ({user.email ?? user.name})
          </button>
        )}
      </div>
      <div className="card">
        <BackupPanel items={items} replaces={mode === 'local'} onDone={notify} />
      </div>
    </section>
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
