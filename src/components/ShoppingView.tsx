import { useEffect, useMemo, useState } from 'react';
import { store, type ShoppingLine, type ShoppingState } from '../store';
import { euro, forecast, itemImage, stockLevel, variantLabel, type Item, type Movement } from '../types';
import { Icon, ItemThumb } from './Icon';
import { Stepper } from './Stepper';

/** Jours de stock restants en dessous desquels un article est proposé « bientôt à racheter ». */
const SOON_DAYS = 14;

export function needOf(item: Item) {
  return Math.max(1, item.target - item.quantity);
}

const priceOf = (item: Item, variantId?: string) => item.variants.find((v) => v.id === variantId)?.price ?? item.variants.find((v) => v.price)?.price;

/**
 * Liste de courses partagée : tout le monde voit les mêmes cases cochées, en direct,
 * et qui s'en occupe. Les articles sous leur seuil y sont d'office.
 */
export function ShoppingView({
  items,
  history,
  onRestock,
  onOpen,
  notify,
}: {
  items: Item[];
  history: Movement[];
  onRestock: (lines: { item: Item; variantId: string; qty: number; price?: number }[]) => void;
  onOpen: (item: Item) => void;
  notify: (text: string) => void;
}) {
  const [state, setState] = useState<ShoppingState>({ extras: [], checked: {} });
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => store.subscribeShopping(setState), []);
  const change = (fn: (s: ShoppingState) => ShoppingState) => {
    setState(fn);
    store.setShopping(fn).catch(() => notify('La liste n’a pas pu être enregistrée'));
  };

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
  // Prévision : articles encore au-dessus du seuil mais qui seront vides dans moins de 2 semaines.
  const soon = useMemo(
    () =>
      items
        .filter((i) => !list.includes(i) && i.quantity > 0)
        .map((i) => ({ item: i, f: forecast(i, history) }))
        .filter((x) => x.f && x.f.daysLeft <= SOON_DAYS)
        .sort((a, b) => a.f!.daysLeft - b.f!.daysLeft),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, history, state.extras, alerts],
  );
  const checkedLines = list.filter((i) => state.checked[i.id]);
  const total = checkedLines.reduce((n, i) => n + (state.checked[i.id].price ?? 0) * state.checked[i.id].qty, 0);

  const toggle = (item: Item) =>
    change((s) => {
      const checked = { ...s.checked };
      if (checked[item.id]) delete checked[item.id];
      else {
        const variantId = item.variants[0]?.id;
        checked[item.id] = { qty: needOf(item), variantId, price: priceOf(item, variantId), by: store.mode === 'cloud' ? store.currentName() : undefined };
      }
      return { ...s, checked };
    });

  const setLine = (item: Item, patch: Partial<ShoppingLine>) =>
    change((s) => ({ ...s, checked: { ...s.checked, [item.id]: { ...s.checked[item.id], ...patch } } }));

  const restock = () => {
    onRestock(
      checkedLines.map((item) => {
        const line = state.checked[item.id];
        const variantId = item.variants.some((v) => v.id === line.variantId) ? line.variantId! : item.variants[0].id;
        return { item, variantId, qty: line.qty, price: line.price };
      }),
    );
    const done = new Set(checkedLines.map((i) => i.id));
    change((s) => ({
      extras: s.extras.filter((id) => !done.has(id)),
      checked: Object.fromEntries(Object.entries(s.checked).filter(([id]) => !done.has(id))),
    }));
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
                        {line?.by && <span className="ellipsis">· coché par {line.by}</span>}
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
                      onClick={() => change((s) => ({ ...s, extras: s.extras.filter((id) => id !== item.id) }))}
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
                    <label className="price-in">
                      <input
                        inputMode="decimal"
                        aria-label="Prix unitaire en euros"
                        placeholder="Prix"
                        defaultValue={line.price ?? ''}
                        onBlur={(e) => {
                          const n = Number(e.target.value.replace(',', '.'));
                          setLine(item, { price: n > 0 ? n : undefined });
                        }}
                      />
                      <span>€</span>
                    </label>
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

      {soon.length > 0 && (
        <div className="soon">
          <p className="muted small">Bientôt vides, d’après votre consommation :</p>
          <ul className="pick-list">
            {soon.map(({ item, f }) => (
              <li key={item.id}>
                <button onClick={() => change((s) => ({ ...s, extras: [...s.extras, item.id] }))}>
                  <ItemThumb category={item.category} imageUrl={itemImage(item)} size={32} />
                  <span className="pick-name">{item.name}</span>
                  <span className="muted">~{Math.max(1, Math.round(f!.daysLeft))} j</span>
                  <Icon name="plus" size={16} />
                </button>
              </li>
            ))}
          </ul>
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
                    change((s) => ({ ...s, extras: [...s.extras, i.id] }));
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
            {total > 0 && ` · ${euro(total)}`}
          </button>
        </div>
      )}
    </section>
  );
}
