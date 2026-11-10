import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { store, type User } from './store';
import { requestPersistentStorage } from './store/local';
import {
  drinkWindow,
  expiryState,
  nextExpiry,
  stockLevel,
  totalOf,
  type Item,
  type ItemInput,
  type ItemPatch,
  type Movement,
  type MovementReason,
  type Variant,
} from './types';
import type { ProductInfo } from './scanner';
import { Icon } from './components/Icon';
import { ItemRow } from './components/ItemRow';
import { ItemSheet, type NewDraft } from './components/ItemSheet';
import { InstallCard, InstallChip } from './components/InstallCard';
import { applyUpdate, useUpdateReady } from './update';
import { daysSinceBackup } from './lib/prefs';

// Écrans chargés à la demande : le premier affichage du stock reste léger.
const ScanView = lazy(() => import('./components/ScanView').then((m) => ({ default: m.ScanView })));
const HistoryView = lazy(() => import('./components/HistoryView').then((m) => ({ default: m.HistoryView })));
const ShoppingView = lazy(() => import('./components/ShoppingView').then((m) => ({ default: m.ShoppingView })));
const InventoryView = lazy(() => import('./components/InventoryView').then((m) => ({ default: m.InventoryView })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));

type View = 'stock' | 'courses' | 'history' | 'settings';
type Panel =
  | { kind: 'new'; draft?: NewDraft }
  | { kind: 'edit'; id: string }
  | { kind: 'scan' }
  | { kind: 'inventory' }
  | null;
interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
type Sort = 'name' | 'alert' | 'location' | 'recent';
type Special = 'expiry' | 'wine';

const SORTS: [Sort, string][] = [
  ['name', 'A → Z'],
  ['alert', 'Alertes d’abord'],
  ['location', 'Par emplacement'],
  ['recent', 'Derniers modifiés'],
];

const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const ratio = (i: Item) => i.quantity / Math.max(1, i.target);

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Début de la fenêtre d'historique chargée : les 6 derniers mois complets (graphique) par défaut. */
const monthsAgo = (n: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - n, 1).getTime();
};

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [view, setView] = useState<View>('stock');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('Tout');
  const [special, setSpecial] = useState<Special | null>(null);
  const [sort, setSortState] = useState<Sort>(() => readPref<Sort>('cellier.sort', 'name'));
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [history, setHistory] = useState<Movement[] | null>(null);
  const [historyMonths, setHistoryMonths] = useState(6);
  const [localHidden, setLocalHidden] = useState(() => readPref<string>('cellier.hideLocal', '') === '1');
  const [bumped, setBumped] = useState<{ id: string; key: number } | null>(null);
  const updateReady = useUpdateReady();

  const setSort = (s: Sort) => {
    setSortState(s);
    writePref('cellier.sort', s);
  };

  useEffect(() => store.onUser(setUser), []);
  useEffect(() => {
    if (store.mode === 'local') requestPersistentStorage();
  }, []);
  useEffect(() => store.onPending(setPending), []);

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

  // L'historique n'est chargé que lorsqu'un écran en a besoin (journal, fiche article, courses, inventaire).
  const needHistory = view === 'history' || view === 'courses' || panel?.kind === 'edit';
  const [historyWanted, setHistoryWanted] = useState(false);
  useEffect(() => {
    if (needHistory) setHistoryWanted(true);
  }, [needHistory]);
  useEffect(() => {
    if (!user || !historyWanted) return;
    return store.subscribeHistory(setHistory, monthsAgo(historyMonths - 1));
  }, [user, historyWanted, historyMonths]);

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
    const t = setTimeout(() => setToast(null), toast.action ? 5000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((text: string, action?: Toast['action']) => setToast({ id: Date.now(), text, action }), []);
  const fail = useCallback((e: unknown) => notify(`Erreur : ${(e as Error)?.message ?? e}`), [notify]);

  // Une écriture refusée par le serveur (droits, quota) arrive après coup.
  useEffect(
    () =>
      store.onWriteError((e) =>
        notify(e.message.includes('permission') ? 'Modification refusée : compte non autorisé.' : `Échec de l’enregistrement : ${e.message}`),
      ),
    [notify],
  );

  const all = useMemo(() => items ?? [], [items]);
  const sorted = useMemo(() => [...all].sort((a, b) => collator.compare(a.name, b.name)), [all]);
  const alerts = useMemo(() => sorted.filter((i) => stockLevel(i) !== 'ok').sort((a, b) => ratio(a) - ratio(b)), [sorted]);
  const expiring = useMemo(() => sorted.filter((i) => expiryState(nextExpiry(i)) !== 'ok'), [sorted]);
  const winesReady = useMemo(
    () => sorted.filter((i) => i.variants.some((v) => v.quantity > 0 && drinkWindow(v.wine) === 'ready')),
    [sorted],
  );
  const categories = useMemo(() => Array.from(new Set(all.map((i) => i.category))).sort(collator.compare), [all]);
  const locations = useMemo(
    () =>
      Array.from(
        new Set(all.flatMap((i) => [i.location, ...i.variants.map((v) => v.location)]).filter(Boolean) as string[]),
      ).sort(collator.compare),
    [all],
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    const pool = special === 'expiry' ? expiring : special === 'wine' ? winesReady : sorted;
    const list = pool.filter(
      (i) =>
        (category === 'Tout' || i.category === category) &&
        (!q ||
          normalize(
            `${i.name} ${i.location ?? ''} ${i.category} ${i.variants
              .map((v) => `${v.label} ${v.location ?? ''} ${v.wine?.appellation ?? ''} ${v.wine?.vintage ?? ''}`)
              .join(' ')}`,
          ).includes(q) ||
          i.variants.some((v) => v.barcode === query.trim())),
    );
    if (special === 'expiry') return [...list].sort((a, b) => (nextExpiry(a) ?? '').localeCompare(nextExpiry(b) ?? ''));
    if (sort === 'alert') return [...list].sort((a, b) => (stockLevel(a) === 'ok' ? 1 : 0) - (stockLevel(b) === 'ok' ? 1 : 0) || ratio(a) - ratio(b));
    if (sort === 'recent') return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    if (sort === 'location')
      return [...list].sort((a, b) => collator.compare(a.location || '~', b.location || '~') || collator.compare(a.name, b.name));
    return list;
  }, [sorted, expiring, winesReady, special, query, category, sort]);

  const totalUnits = all.reduce((n, i) => n + i.quantity, 0);

  // ---- Historique : les appuis répétés sur +/− d'une même référence forment une seule ligne. ----
  const pendingLog = useRef<{ key: string; m: Parameters<typeof store.logMovement>[0]; timer: number } | null>(null);
  const flushLog = useCallback(() => {
    const p = pendingLog.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingLog.current = null;
    if (p.m.delta !== 0) store.logMovement(p.m).catch(() => {});
  }, []);
  useEffect(() => {
    // `pagehide` n'est pas toujours émis quand le système ferme l'app : on écrit aussi dès qu'elle passe en arrière-plan.
    const onHide = () => document.visibilityState === 'hidden' && flushLog();
    window.addEventListener('pagehide', flushLog);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushLog);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flushLog]);

  const log = useCallback(
    (
      item: Pick<Item, 'id' | 'name' | 'category'>,
      variant: Pick<Variant, 'label'> | undefined,
      delta: number,
      reason: MovementReason,
      price?: number,
    ) => {
      const m = {
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        variantLabel: variant?.label.trim() || undefined,
        delta,
        reason,
        ...(price ? { price } : {}),
      };
      if (reason !== 'manuel') {
        flushLog();
        store.logMovement(m).catch(() => {});
        return;
      }
      // Un « Annuler » juste après un appui s'annule avec lui au lieu de créer deux lignes.
      const key = `${item.id}|${m.variantLabel ?? ''}`;
      const p = pendingLog.current;
      if (p && p.key === key) {
        clearTimeout(p.timer);
        p.m.delta += delta;
        p.timer = window.setTimeout(flushLog, 4000);
      } else {
        flushLog();
        pendingLog.current = { key, m, timer: window.setTimeout(flushLog, 4000) };
      }
    },
    [flushLog],
  );

  const adjust = useCallback(
    (item: Item, variantId: string, delta: number, reason: MovementReason = 'manuel', opts: { price?: number; silent?: boolean } = {}) => {
      const variant = item.variants.find((v) => v.id === variantId);
      if (!variant) return;
      // Jamais sous zéro : on retire au plus ce qui reste.
      const d = delta < 0 ? -Math.min(-delta, variant.quantity) : delta;
      if (!d) return;
      store.adjust(item, variantId, d).catch(fail);
      log(item, item.variants.length > 1 ? variant : undefined, d, reason, opts.price);
      setBumped({ id: item.id, key: Date.now() });
      if (opts.silent) return;
      const next = item.quantity + d;
      const crossed = d < 0 && item.target > 0 && next < item.target && item.quantity >= item.target;
      const text = crossed
        ? next === 0
          ? `${item.name} : rupture de stock`
          : `${item.name} passe sous le seuil (${next}/${item.target})`
        : `${d > 0 ? '+' : '−'}${Math.abs(d)} ${item.name} · ${next} ${item.unit}`;
      if (reason === 'manuel') {
        // Undo : on repart de l'état après le geste.
        const after: Item = {
          ...item,
          quantity: next,
          variants: item.variants.map((v) => (v.id === variantId ? { ...v, quantity: v.quantity + d } : v)),
        };
        notify(text, { label: 'Annuler', run: () => adjust(after, variantId, -d, 'manuel', { silent: true }) });
      } else if (crossed) notify(text);
    },
    [fail, notify, log],
  );

  const create = async (input: ItemInput, id?: string) => {
    try {
      const newId = await store.create(input, id);
      const qty = totalOf(input.variants);
      if (qty > 0) log({ id: newId, name: input.name, category: input.category }, input.variants[0], qty, 'création', input.variants[0]?.price);
      notify(`${input.name} ajouté`);
      setPanel(null);
    } catch (e) {
      // La fiche reste ouverte : rien n'est perdu.
      fail(e);
    }
  };

  const update = async (id: string, patch: ItemPatch) => {
    try {
      await store.update(id, patch);
      notify('Article mis à jour');
      setPanel(null);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (item: Item) => {
    try {
      await store.remove(item.id);
    } catch (e) {
      fail(e);
      return;
    }
    setPanel(null);
    if (item.quantity > 0) log(item, undefined, -item.quantity, 'suppression');
    const { id, name, category, location, target, unit, variants } = item;
    notify(`${item.name} supprimé`, {
      label: 'Annuler',
      // Même identifiant : l'article retrouve son historique.
      run: () => create({ name, category, location, target, unit, variants }, id),
    });
  };

  const restock = (lines: { item: Item; variantId: string; qty: number; price?: number }[]) => {
    for (const l of lines) {
      adjust(l.item, l.variantId, l.qty, 'courses', { price: l.price, silent: true });
      const v = l.item.variants.find((x) => x.id === l.variantId);
      if (l.price && v && v.price !== l.price) store.updateVariant(l.item, l.variantId, { price: l.price }).catch(fail);
    }
    const n = lines.reduce((a, l) => a + l.qty, 0);
    notify(`${n} unité${n > 1 ? 's' : ''} rangée${n > 1 ? 's' : ''} en stock`);
  };

  /** Applique les écarts d'un inventaire : chaque référence prend la quantité comptée. */
  const applyCount = (counts: { item: Item; variantId: string; counted: number }[]) => {
    let n = 0;
    for (const c of counts) {
      const v = c.item.variants.find((x) => x.id === c.variantId);
      if (!v || v.quantity === c.counted) continue;
      adjust(c.item, c.variantId, c.counted - v.quantity, 'inventaire', { silent: true });
      n++;
    }
    notify(n ? `Inventaire validé : ${n} correction${n > 1 ? 's' : ''}` : 'Inventaire validé : aucun écart');
    setPanel(null);
  };

  if (user === undefined) return <Splash />;
  if (user === null) return <Login onSignIn={() => store.signIn().catch(fail)} />;

  const editing = panel?.kind === 'edit' ? all.find((i) => i.id === panel.id) : undefined;
  const backupAge = daysSinceBackup();
  const backupDue = store.mode === 'local' && all.length > 0 && (backupAge === null || backupAge > 30);

  // Regroupement par emplacement : un en-tête à chaque changement.
  const rows: ReactNode[] = [];
  let lastLoc: string | null = null;
  for (const item of visible) {
    if (sort === 'location' && !special) {
      const loc = item.location || 'Sans emplacement';
      if (loc !== lastLoc) {
        rows.push(
          <li key={`h-${loc}`} className="group-head">
            <Icon name="pin" size={14} /> {loc}
          </li>,
        );
        lastLoc = loc;
      }
    }
    rows.push(
      <ItemRow
        key={item.id}
        item={item}
        bump={bumped?.id === item.id ? bumped.key : undefined}
        onOpen={() => setPanel({ kind: 'edit', id: item.id })}
        onAdjust={(d) => adjust(item, item.variants[0].id, d)}
      />,
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <h1>
            <span className="eyebrow">Inventaire</span> Cellier
          </h1>
          <div className="top-actions">
            <InstallChip onClick={() => setView('settings')} />
            <SyncBadge mode={store.mode} online={online} pending={pending} onClick={() => setView('settings')} />
          </div>
        </div>

        {view === 'stock' && (
          <div className="stats">
            <button
              className={`stat${category === 'Tout' && !special ? ' on' : ''}`}
              onClick={() => {
                setCategory('Tout');
                setSpecial(null);
              }}
            >
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
      {updateReady && (
        <div className="banner update">
          <Icon name="download" size={16} />
          <span>Une nouvelle version de l’app est prête.</span>
          <button className="btn small primary" onClick={applyUpdate}>
            Recharger
          </button>
        </div>
      )}
      {store.mode === 'local' && view === 'stock' && !localHidden && (
        <div className="banner info">
          <Icon name="device" size={16} />
          <span>
            Mode local : les données restent sur cet appareil.
            {backupDue && (
              <>
                {' '}
                <button className="link" onClick={() => setView('settings')}>
                  {backupAge === null ? 'Faire une sauvegarde' : `Sauvegarde il y a ${backupAge} j`} ›
                </button>
              </>
            )}
          </span>
          <button
            className="banner-close"
            aria-label="Masquer"
            onClick={() => {
              setLocalHidden(true);
              writePref('cellier.hideLocal', '1');
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {backupDue && localHidden && view === 'stock' && (
        <button className="banner warn" onClick={() => setView('settings')}>
          <Icon name="download" size={16} />
          <span>
            {backupAge === null ? 'Aucune sauvegarde de l’inventaire.' : `Dernière sauvegarde il y a ${backupAge} jours.`} Exporter
            maintenant ›
          </span>
        </button>
      )}

      <main>
        <Suspense fallback={<SkeletonList />}>
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
                {(categories.length > 1 || expiring.length > 0 || winesReady.length > 0) && (
                  <div className="chips scroll">
                    {expiring.length > 0 && (
                      <button
                        className={`chip warn${special === 'expiry' ? ' on' : ''}`}
                        onClick={() => setSpecial(special === 'expiry' ? null : 'expiry')}
                      >
                        À consommer ({expiring.length})
                      </button>
                    )}
                    {winesReady.length > 0 && (
                      <button className={`chip${special === 'wine' ? ' on' : ''}`} onClick={() => setSpecial(special === 'wine' ? null : 'wine')}>
                        Vins à boire ({winesReady.length})
                      </button>
                    )}
                    {categories.length > 1 &&
                      ['Tout', ...categories].map((c) => (
                        <button key={c} className={`chip${category === c ? ' on' : ''}`} onClick={() => setCategory(c)}>
                          {c}
                        </button>
                      ))}
                  </div>
                )}
                {all.length > 0 && (
                  <div className="list-tools">
                    <label className="sort">
                      <span className="muted">Trier</span>
                      <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Trier la liste">
                        {SORTS.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn small ghost" onClick={() => setPanel({ kind: 'inventory' })}>
                      <Icon name="check" size={16} /> Faire l’inventaire
                    </button>
                  </div>
                )}
              </div>

              {items === null ? (
                <SkeletonList />
              ) : visible.length ? (
                <ul className="list">{rows}</ul>
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
            <ShoppingView
              items={all}
              history={history ?? []}
              onRestock={restock}
              onOpen={(item) => setPanel({ kind: 'edit', id: item.id })}
              notify={notify}
            />
          ) : view === 'history' ? (
            <HistoryView
              movements={history}
              months={historyMonths}
              onMore={() => setHistoryMonths((m) => m + 6)}
              notify={notify}
            />
          ) : (
            <SettingsView
              user={user}
              online={online}
              pending={pending}
              items={all}
              notify={notify}
              loadHistory={() => {
                setHistoryWanted(true);
                setHistoryMonths((m) => Math.max(m, 120));
              }}
              history={history}
              install={<InstallCard notify={notify} />}
              onShowLocal={() => {
                setLocalHidden(false);
                writePref('cellier.hideLocal', '');
              }}
            />
          )}
        </Suspense>
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

      <Suspense fallback={null}>
        {panel?.kind === 'scan' && (
          <ScanView
            items={all}
            onClose={() => setPanel(null)}
            onAdjust={(item, vid, d) => adjust(item, vid, d, 'scan', { silent: true })}
            onOpen={(item) => setPanel({ kind: 'edit', id: item.id })}
            onCreate={(barcode: string, info: ProductInfo | null | undefined) => setPanel({ kind: 'new', draft: { barcode, info } })}
            onAddVariant={(item: Item, v: Variant) => store.addVariant(item, v).catch(fail)}
          />
        )}

        {panel?.kind === 'inventory' && (
          <InventoryView items={sorted} locations={locations} onClose={() => setPanel(null)} onApply={applyCount} />
        )}

        {(panel?.kind === 'new' || editing) && (
          <ItemSheet
            key={panel?.kind === 'edit' ? panel.id : `new-${panel?.kind === 'new' ? panel.draft?.barcode : ''}`}
            item={editing}
            draft={panel?.kind === 'new' ? panel.draft : undefined}
            categories={categories}
            locations={locations}
            history={history}
            onClose={() => setPanel(null)}
            onCreate={(input) => create(input)}
            onUpdate={(patch) => update(editing!.id, patch)}
            onDelete={editing ? () => remove(editing) : undefined}
            onAdjust={editing ? (vid, d) => adjust(editing, vid, d) : undefined}
            onAddVariant={editing ? (v) => store.addVariant(editing, v).catch(fail) : undefined}
            onUpdateVariant={editing ? (vid, p) => store.updateVariant(editing, vid, p).catch(fail) : undefined}
            onRemoveVariant={editing ? (vid) => store.removeVariant(editing, vid).catch(fail) : undefined}
            onSetTarget={editing ? (t) => store.update(editing.id, { target: t }).then(() => notify(`Seuil réglé à ${t}`), fail) : undefined}
            historySlot={editing ? <HistoryView movements={history} itemId={editing.id} /> : undefined}
          />
        )}
      </Suspense>

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

function SyncBadge({ mode, online, pending, onClick }: { mode: 'cloud' | 'local'; online: boolean; pending: number; onClick: () => void }) {
  const label =
    mode === 'local' ? 'Local' : !online ? (pending ? `Hors-ligne · ${pending} en attente` : 'Hors-ligne') : pending ? 'Envoi…' : 'Synchro';
  return (
    <button className={`sync ${mode === 'local' ? 'local' : online ? 'live' : 'off'}`} onClick={onClick}>
      <i />
      {label}
    </button>
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

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
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
