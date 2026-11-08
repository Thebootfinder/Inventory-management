import { useEffect, useMemo, useState } from 'react';
import { itemImage, stockLevel, variantLabel, type Item } from '../types';
import { Icon, ItemThumb } from './Icon';
import { Stepper } from './Stepper';

/** État de la liste propre à ce téléphone : articles ajoutés à la main et cases cochées. */
interface ListState {
  extras: string[];
  checked: Record<string, { qty: number; variantId?: string }>;
}

const KEY = 'cellier.courses.v1';

function load(): ListState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ListState | null;
    if (s && Array.isArray(s.extras) && s.checked) return s;
  } catch {
    /* ignore */
  }
  return { extras: [], checked: {} };
}

export function needOf(item: Item) {
  return Math.max(1, item.target - item.quantity);
}

export function ShoppingView({
  items,
  onRestock,
  onOpen,
  notify,
}: {
  items: Item[];
  onRestock: (lines: { item: Item; variantId: string; qty: number }[]) => void;
  onOpen: (item: Item) => void;
  notify: (text: string) => void;
}) {
  const [state, setState] = useState<ListState>(load);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const alerts = useMemo(
    () =>
      items
        .filter((i) => stockLevel(i) !== 'ok')
        .sort((a, b) => a.quantity / Math.max(1, a.target) - b.quantity / Math.max(1, b.target)),
    [items],
  );
  const extras = useMemo(
    () => state.extras.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i && !alerts.includes(i)),
    [state.extras, items, alerts],
  );
  const list = [...alerts, ...extras];
  const checkedLines = list.filter((i) => state.checked[i.id]);

  const toggle = (item: Item) =>
    setState((s) => {
      const checked = { ...s.checked };
      if (checked[item.id]) delete checked[item.id];
      else checked[item.id] = { qty: needOf(item), variantId: item.variants[0]?.id };
      return { ...s, checked };
    });

  const setLine = (item: Item, patch: Partial<ListState['checked'][string]>) =>
    setState((s) => ({ ...s, checked: { ...s.checked, [item.id]: { ...s.checked[item.id], ...patch } } }));

  const restock = () => {
    onRestock(
      checkedLines.map((item) => {
        const line = state.checked[item.id];
        const variantId = item.variants.some((v) => v.id === line.variantId) ? line.variantId! : item.variants[0].id;
        return { item, variantId, qty: line.qty };
      }),
    );
    const done = new Set(checkedLines.map((i) => i.id));
    setState((s) => ({ extras: s.extras.filter((id) => !done.has(id)), checked: {} }));
  };

  const share = async () => {
    const text =
      'Courses du cellier :\n' +
      list
        .filter((i) => !state.checked[i.id])
        .map((i) => `• ${i.name} — ${needOf(i)} ${i.unit}${i.quantity ? ` (reste ${i.quantity})` : ''}`)
        .join('\n');
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

  const q = query.trim().toLowerCase();
  const candidates = items
    .filter((i) => !list.includes(i) && (!q || i.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <section className="shopping">
      <div className="section-head">
        <div>
          <h2>Courses</h2>
          <p className="muted small">Cochez ce que vous achetez, puis rangez tout en stock d’un coup.</p>
        </div>
        {list.length > 0 && (
          <button className="btn small" onClick={share} aria-label="Partager la liste">
            <Icon name="share" size={16} />
          </button>
        )}
      </div>

      {list.length ? (
        <ul className="list">
          {list.map((item) => {
            const line = state.checked[item.id];
            const level = stockLevel(item);
            return (
              <li key={item.id} className={`shop-row${line ? ' done' : ''}`}>
                <div className="shop-main">
                  <button className={`check${line ? ' on' : ''}`} onClick={() => toggle(item)} aria-pressed={!!line} aria-label={`Acheté : ${item.name}`}>
                    {line && <Icon name="check" size={18} />}
                  </button>
                  <button className="shop-text" onClick={() => onOpen(item)}>
                    <ItemThumb category={item.category} imageUrl={itemImage(item)} size={40} />
                    <div className="row-text">
                      <div className="row-name">{item.name}</div>
                      <div className="row-meta">
                        {level === 'ok' ? (
                          <span className="pill refs">Ajouté</span>
                        ) : (
                          <span className={`pill ${level}`}>{item.quantity === 0 ? 'Rupture' : `Reste ${item.quantity}`}</span>
                        )}
                        <span>seuil {item.target}</span>
                      </div>
                    </div>
                  </button>
                  {!line ? (
                    <div className="need">
                      <span>Acheter</span>
                      <strong>{needOf(item)}</strong>
                    </div>
                  ) : null}
                  {!line && extras.includes(item) && (
                    <button
                      className="icon-btn"
                      onClick={() => setState((s) => ({ ...s, extras: s.extras.filter((id) => id !== item.id) }))}
                      aria-label="Retirer de la liste"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                {line && (
                  <div className="shop-line">
                    <span className="muted">Acheté</span>
                    <Stepper value={line.qty} onChange={(qty) => setLine(item, { qty })} min={1} />
                    {item.variants.length > 1 && (
                      <select value={line.variantId} onChange={(e) => setLine(item, { variantId: e.target.value })} aria-label="Marque achetée">
                        {item.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {variantLabel(item, v)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <div className="empty-art">
            <Icon name="check" size={30} />
          </div>
          <h3>Rien à acheter</h3>
          <p>Aucun article n’est sous son seuil. Vous pouvez quand même en ajouter un à la liste.</p>
        </div>
      )}

      {picking ? (
        <div className="picker">
          <label className="search">
            <Icon name="search" size={18} />
            <input autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ajouter un article à la liste…" />
          </label>
          <ul className="pick-list">
            {candidates.slice(0, 30).map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => {
                    setState((s) => ({ ...s, extras: [...s.extras, i.id] }));
                    setPicking(false);
                    setQuery('');
                  }}
                >
                  <ItemThumb category={i.category} imageUrl={itemImage(i)} size={32} />
                  <span className="pick-name">{i.name}</span>
                  <span className="muted">{i.quantity}</span>
                </button>
              </li>
            ))}
            {!candidates.length && <li className="muted pick-empty">Aucun autre article.</li>}
          </ul>
          <button className="btn ghost small" onClick={() => setPicking(false)}>
            Fermer
          </button>
        </div>
      ) : (
        items.length > list.length && (
          <button className="btn small ghost add-ref" onClick={() => setPicking(true)}>
            <Icon name="plus" size={16} /> Ajouter un article à la liste
          </button>
        )
      )}

      {checkedLines.length > 0 && (
        <div className="restock-bar">
          <button className="btn in-btn wide-btn" onClick={restock}>
            <Icon name="box" size={18} /> Ranger {checkedLines.length} article{checkedLines.length > 1 ? 's' : ''} en stock
          </button>
        </div>
      )}
    </section>
  );
}
