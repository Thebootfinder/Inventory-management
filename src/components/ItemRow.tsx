import { itemImage, stockLevel, type Item } from '../types';
import { Icon, ItemThumb } from './Icon';

export function ItemRow({
  item,
  onOpen,
  onAdjust,
}: {
  item: Item;
  onOpen: () => void;
  onAdjust: (delta: number) => void;
}) {
  const level = stockLevel(item);
  const pct = item.target > 0 ? Math.min(100, (item.quantity / item.target) * 100) : 100;
  const single = item.variants.length === 1;
  const refs = item.variants.length;
  return (
    <li className={`row level-${level}`}>
      <button className="row-main" onClick={onOpen}>
        <ItemThumb category={item.category} imageUrl={itemImage(item)} />
        <div className="row-text">
          <div className="row-name">{item.name}</div>
          <div className="row-meta">
            {level === 'out' && <span className="pill out">Rupture</span>}
            {level === 'low' && <span className="pill low">Stock bas</span>}
            {refs > 1 ? <span className="pill refs">{refs} références</span> : <span>{item.location || item.category}</span>}
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
            <strong>{item.quantity}</strong>
            <small>{item.unit}</small>
          </div>
          <button className="qty-btn plus" onClick={() => onAdjust(1)} aria-label={`Ajouter un ${item.name}`}>
            <Icon name="plus" size={18} />
          </button>
        </div>
      ) : (
        <button className="row-qty total" onClick={onOpen} aria-label={`Détail de ${item.name}`}>
          <div className="qty">
            <strong>{item.quantity}</strong>
            <small>{item.unit}</small>
          </div>
          <Icon name="chevron" size={18} />
        </button>
      )}
    </li>
  );
}
