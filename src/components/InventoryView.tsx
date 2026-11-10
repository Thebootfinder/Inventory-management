import { useMemo, useState } from 'react';
import { itemImage, variantLabel, type Item } from '../types';
import { Icon, ItemThumb } from './Icon';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Mode inventaire : on compte ce qu'il y a réellement sur l'étagère, référence par référence.
 * Rien ne change tant qu'on n'a pas validé ; les écarts sont alors enregistrés dans l'historique (« inventaire »).
 */
export function InventoryView({
  items,
  locations,
  onClose,
  onApply,
}: {
  items: Item[];
  locations: string[];
  onClose: () => void;
  onApply: (counts: { item: Item; variantId: string; counted: number }[]) => void;
}) {
  const [place, setPlace] = useState<string>('Tout');
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);

  const lines = useMemo(
    () =>
      items.flatMap((item) =>
        item.variants.map((v) => ({ item, variant: v, key: `${item.id}|${v.id}`, location: v.location || item.location || '' })),
      ),
    [items],
  );
  const q = normalize(query.trim());
  const shown = lines.filter(
    (l) =>
      (place === 'Tout' || l.location === place) &&
      (!q || normalize(`${l.item.name} ${l.variant.label}`).includes(q) || l.variant.barcode === query.trim()),
  );
  const diffs = lines.filter((l) => l.key in counts && counts[l.key] !== l.variant.quantity);
  const checked = Object.keys(counts).length;

  return (
    <Sheet
      title={review ? 'Écarts à corriger' : 'Faire l’inventaire'}
      onClose={onClose}
      footer={
        review ? (
          <>
            <button className="btn ghost" onClick={() => setReview(false)}>
              Retour
            </button>
            <button
              className="btn primary grow"
              onClick={() => onApply(diffs.map((l) => ({ item: l.item, variantId: l.variant.id, counted: counts[l.key] })))}
            >
              {diffs.length ? `Corriger ${diffs.length} écart${diffs.length > 1 ? 's' : ''}` : 'Terminer'}
            </button>
          </>
        ) : (
          <button className="btn primary grow" disabled={!checked} onClick={() => setReview(true)}>
            {checked ? `Voir les écarts (${diffs.length})` : 'Comptez au moins un article'}
          </button>
        )
      }
    >
      {review ? (
        diffs.length ? (
          <ul className="count-list">
            {diffs.map((l) => {
              const d = counts[l.key] - l.variant.quantity;
              return (
                <li key={l.key} className="count-row">
                  <ItemThumb category={l.item.category} imageUrl={l.variant.imageUrl ?? itemImage(l.item)} size={36} />
                  <div className="row-text">
                    <div className="row-name">{l.item.name}</div>
                    {l.item.variants.length > 1 && <div className="muted small ellipsis">{variantLabel(l.item, l.variant)}</div>}
                  </div>
                  <span className="muted">
                    {l.variant.quantity} → <b>{counts[l.key]}</b>
                  </span>
                  <span className={`mv-delta ${d > 0 ? 'in' : 'out'}`}>
                    {d > 0 ? '+' : '−'}
                    {Math.abs(d)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="banner info">Tout correspond : le stock de l’app est juste pour les {checked} références comptées.</p>
        )
      ) : (
        <>
          <p className="hint">
            Comptez ce qu’il y a vraiment, étagère par étagère. Une référence touchée est marquée comptée ; les autres ne changent pas.
          </p>
          {locations.length > 0 && (
            <div className="chips scroll">
              {['Tout', ...locations].map((l) => (
                <button key={l} className={`chip${place === l ? ' on' : ''}`} onClick={() => setPlace(l)}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <label className="search">
            <Icon name="search" size={18} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher ou saisir un code…" />
          </label>
          <ul className="count-list">
            {shown.map((l) => {
              const counted = l.key in counts;
              const value = counted ? counts[l.key] : l.variant.quantity;
              const changed = counted && value !== l.variant.quantity;
              return (
                <li key={l.key} className={`count-row${counted ? ' counted' : ''}${changed ? ' changed' : ''}`}>
                  <button
                    className={`check${counted ? ' on' : ''}`}
                    aria-pressed={counted}
                    aria-label={`Compté : ${l.item.name}`}
                    onClick={() =>
                      setCounts((c) => {
                        const next = { ...c };
                        if (counted) delete next[l.key];
                        else next[l.key] = l.variant.quantity;
                        return next;
                      })
                    }
                  >
                    {counted && <Icon name="check" size={16} />}
                  </button>
                  <div className="row-text">
                    <div className="row-name">{l.item.name}</div>
                    <div className="muted small ellipsis">
                      {[l.item.variants.length > 1 ? variantLabel(l.item, l.variant) : '', l.location, `app : ${l.variant.quantity}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Stepper value={value} onChange={(v) => setCounts((c) => ({ ...c, [l.key]: v }))} />
                </li>
              );
            })}
            {!shown.length && <li className="muted pick-empty">Aucun article ici.</li>}
          </ul>
        </>
      )}
    </Sheet>
  );
}
