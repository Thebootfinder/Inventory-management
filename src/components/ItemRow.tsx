import { daysUntil, drinkWindow, expiryState, itemImage, nextExpiry, stockLevel, type Item } from '../types';
import { Icon, ItemThumb } from './Icon';

export function expiryLabel(date: string) {
  const d = daysUntil(date);
  if (d < 0) return `Périmé depuis ${-d} j`;
  if (d === 0) return 'Périme aujourd’hui';
  if (d === 1) return 'Périme demain';
  return `Périme dans ${d} j`;
}

export function ItemRow({
  item,
  onOpen,
  onAdjust,
  bump,
}: {
  item: Item;
  onOpen: () => void;
  onAdjust: (delta: number) => void;
  /** Change à chaque +/− pour rejouer l'animation du chiffre. */
  bump?: number;
}) {
  const level = stockLevel(item);
  const pct = item.target > 0 ? Math.min(100, (item.quantity / item.target) * 100) : 100;
  const single = item.variants.length === 1;
  const refs = item.variants.length;
  const expiry = nextExpiry(item);
  const exp = expiryState(expiry);
  const ready = item.variants.some((v) => v.quantity > 0 && drinkWindow(v.wine) === 'ready');
  return (
    <li className={`row level-${level}`}>
      <button className="row-main" onClick={onOpen}>
        <ItemThumb category={item.category} imageUrl={itemImage(item)} />
        <div className="row-text">
          <div className="row-name">{item.name}</div>
          <div className="row-meta">
            {level === 'out' && <span className="pill out">Rupture</span>}
            {level === 'low' && <span className="pill low">Stock bas</span>}
            {exp !== 'ok' && expiry && <span className={`pill ${exp === 'expired' ? 'out' : 'low'}`}>{expiryLabel(expiry)}</span>}
            {ready && <span className="pill ok">À boire</span>}
            {refs > 1 ? <span className="pill refs">{refs} références</span> : <span className="ellipsis">{item.location || item.category}</span>}
            {item.target > 0 && refs === 1 && <span className="muted">· min {item.target}</span>}
          </div>
          {item.target > 0 && (
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </button>
      {single ? (
        <div className="row-qty">
          <button
            className="qty-btn"
            onClick={() => onAdjust(-1)}
            disabled={item.quantity <= 0}
            aria-label={`Retirer un ${item.name}`}
          >
            <Icon name="minus" size={18} />
          </button>
          <div className="qty">
            <strong key={bump} className={bump ? 'bump' : undefined}>
              {item.quantity}
            </strong>
            <small>{item.unit}</small>
          </div>
          <button className="qty-btn plus" onClick={() => onAdjust(1)} aria-label={`Ajouter un ${item.name}`}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      ) : (
        <button className="row-qty total" onClick={onOpen} aria-label={`Détail de ${item.name}`}>
          <div className="qty">
            <strong key={bump} className={bump ? 'bump' : undefined}>
              {item.quantity}
            </strong>
            <small>{item.unit}</small>
          </div>
          <Icon name="chevron" size={18} />
        </button>
      )}
    </li>
  );
}
