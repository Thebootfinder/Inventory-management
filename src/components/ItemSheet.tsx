import { useEffect, useState, type ReactNode } from 'react';
import { lookupProduct, type ProductInfo } from '../scanner';
import {
  DEFAULT_CATEGORIES,
  drinkWindow,
  euro,
  expiryState,
  forecast,
  itemImage,
  newId,
  stockLevel,
  suggestedTarget,
  variantLabel,
  WINE_COLORS,
  type Item,
  type ItemInput,
  type ItemPatch,
  type Movement,
  type Variant,
  type WineColor,
  type WineInfo,
} from '../types';
import { Icon, ItemThumb } from './Icon';
import { expiryLabel } from './ItemRow';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

const UNITS = ['pcs', 'bouteilles', 'canettes', 'briques', 'boîtes', 'paquets', 'kg', 'L'];

export interface NewDraft {
  barcode?: string;
  info?: ProductInfo | null;
}

interface Props {
  item?: Item;
  draft?: NewDraft;
  categories: string[];
  locations: string[];
  onClose: () => void;
  onCreate: (input: ItemInput) => Promise<void>;
  onUpdate: (patch: ItemPatch) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAdjust?: (variantId: string, delta: number) => void;
  onAddVariant?: (v: Variant) => Promise<void>;
  onUpdateVariant?: (id: string, patch: Partial<Omit<Variant, 'id'>>) => Promise<void>;
  onRemoveVariant?: (id: string) => Promise<void>;
  onSetTarget?: (target: number) => void;
  history?: Movement[] | null;
  historySlot?: ReactNode;
}

/** Champs propres à une référence : emplacement, péremption, prix, fiche vin. */
export interface VariantExtras {
  location?: string;
  expiry?: string;
  price?: number;
  wine?: WineInfo;
}

const cleanWine = (w: WineInfo | undefined): WineInfo | undefined => {
  if (!w) return undefined;
  const out = Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined && v !== '' && !Number.isNaN(v))) as WineInfo;
  return Object.keys(out).length ? out : undefined;
};

export function cleanExtras(x: VariantExtras): VariantExtras {
  return {
    location: x.location?.trim() || undefined,
    expiry: x.expiry || undefined,
    price: x.price && x.price > 0 ? Math.round(x.price * 100) / 100 : undefined,
    wine: cleanWine(x.wine),
  };
}

const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

/** Formulaire des champs optionnels d'une référence, repliable pour ne pas encombrer. */
function ExtrasFields({
  value,
  onChange,
  isWine,
  open,
}: {
  value: VariantExtras;
  onChange: (v: VariantExtras) => void;
  isWine: boolean;
  open?: boolean;
}) {
  const w = value.wine ?? {};
  const setW = (patch: Partial<WineInfo>) => onChange({ ...value, wine: { ...w, ...patch } });
  const year = new Date().getFullYear();
  return (
    <details className="extras" open={open}>
      <summary>{isWine ? 'Péremption, prix, emplacement, fiche vin' : 'Péremption, prix, emplacement'}</summary>
      <div className="grid2">
        <label className="field">
          <span>À consommer avant</span>
          <input type="date" value={value.expiry ?? ''} onChange={(e) => onChange({ ...value, expiry: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span>Prix unitaire (€)</span>
          <input
            inputMode="decimal"
            value={value.price ?? ''}
            onChange={(e) => onChange({ ...value, price: numOrUndef(e.target.value) })}
            placeholder="Ex. 4,50"
          />
        </label>
      </div>
      <label className="field">
        <span>Emplacement de cette référence (si différent de l’article)</span>
        <input
          value={value.location ?? ''}
          onChange={(e) => onChange({ ...value, location: e.target.value })}
          placeholder="Ex. Cave, Congélateur"
          list="locations"
        />
      </label>
      {isWine && (
        <div className="wine-fields">
          <div className="grid2">
            <label className="field">
              <span>Millésime</span>
              <input inputMode="numeric" value={w.vintage ?? ''} onChange={(e) => setW({ vintage: numOrUndef(e.target.value) })} placeholder={String(year - 3)} />
            </label>
            <label className="field">
              <span>Couleur</span>
              <select value={w.color ?? ''} onChange={(e) => setW({ color: (e.target.value || undefined) as WineColor | undefined })}>
                <option value="">—</option>
                {WINE_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Appellation</span>
            <input value={w.appellation ?? ''} onChange={(e) => setW({ appellation: e.target.value || undefined })} placeholder="Ex. Côtes-du-Rhône" />
          </label>
          <div className="grid2">
            <label className="field">
              <span>À boire à partir de</span>
              <input inputMode="numeric" value={w.drinkFrom ?? ''} onChange={(e) => setW({ drinkFrom: numOrUndef(e.target.value) })} placeholder={String(year)} />
            </label>
            <label className="field">
              <span>Jusqu’à</span>
              <input inputMode="numeric" value={w.drinkUntil ?? ''} onChange={(e) => setW({ drinkUntil: numOrUndef(e.target.value) })} placeholder={String(year + 5)} />
            </label>
          </div>
          <div className="field">
            <span>Note</span>
            <div className="stars" role="radiogroup" aria-label="Note">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  role="radio"
                  aria-checked={w.rating === n}
                  aria-label={`${n} sur 5`}
                  className={(w.rating ?? 0) >= n ? 'on' : ''}
                  onClick={() => setW({ rating: w.rating === n ? undefined : n })}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Notes de dégustation</span>
            <textarea rows={2} value={w.notes ?? ''} onChange={(e) => setW({ notes: e.target.value || undefined })} placeholder="Accords, impressions…" />
          </label>
        </div>
      )}
    </details>
  );
}

export function ItemSheet(props: Props) {
  const { item, draft, categories, locations, onClose } = props;
  const [group, setGroup] = useState<ItemPatch & { name: string }>(() =>
    item
      ? { name: item.name, category: item.category, location: item.location, target: item.target, unit: item.unit }
      : { name: '', category: 'Vin', location: '', target: 2, unit: 'bouteilles' },
  );
  // Champs de la première référence, uniquement à la création.
  const [first, setFirst] = useState({ label: '', barcode: draft?.barcode ?? '', quantity: 1, imageUrl: undefined as string | undefined });
  const [firstExtras, setFirstExtras] = useState<VariantExtras>({});
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setG = <K extends keyof typeof group>(k: K, v: (typeof group)[K]) => setGroup((g) => ({ ...g, [k]: v }));

  const applyInfo = (info: ProductInfo) => {
    setGroup((g) => ({
      ...g,
      name: g.name || info.generic || info.name || '',
      category: info.category ?? g.category,
      unit: info.category && !['Vin', 'Spiritueux'].includes(info.category) ? 'pcs' : g.unit,
    }));
    setFirst((f) => ({ ...f, label: f.label || info.name || '', imageUrl: info.imageUrl }));
  };

  // Nouveau produit scanné : on pré-remplit depuis Open Food Facts.
  useEffect(() => {
    if (item || !draft?.barcode) return;
    if (draft.info !== undefined) {
      if (draft.info) applyInfo(draft.info);
      return;
    }
    let alive = true;
    setLooking(true);
    lookupProduct(draft.barcode).then((info) => {
      if (!alive) return;
      setLooking(false);
      if (info) applyInfo(info);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, draft]);

  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...categories]));
  const valid = group.name.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    const patch = { ...group, name: group.name.trim(), location: group.location?.trim() || undefined };
    try {
      if (item) await props.onUpdate(patch);
      else
        await props.onCreate({
          name: patch.name,
          category: patch.category ?? 'Autre',
          location: patch.location,
          target: patch.target ?? 0,
          unit: patch.unit ?? 'pcs',
          variants: [
            {
              id: newId(),
              label: first.label.trim(),
              barcode: first.barcode.trim() || undefined,
              quantity: first.quantity,
              imageUrl: first.imageUrl,
              createdAt: Date.now(),
              ...cleanExtras(firstExtras),
            },
          ],
        });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={item ? item.name : 'Nouvel article'}
      onClose={onClose}
      footer={
        <>
          {props.onDelete &&
            (confirmDelete ? (
              <button className="btn danger" onClick={props.onDelete}>
                Supprimer l’article
              </button>
            ) : (
              <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)} aria-label="Supprimer l’article">
                <Icon name="trash" size={18} />
              </button>
            ))}
          <button className="btn primary grow" disabled={!valid || saving} onClick={submit}>
            {saving ? 'Enregistrement…' : item ? 'Enregistrer' : 'Ajouter au stock'}
          </button>
        </>
      }
    >
      {item && (
        <>
          <div className={`quick level-${stockLevel(item)}`}>
            <ItemThumb category={item.category} imageUrl={itemImage(item)} size={52} />
            <div className="quick-qty">
              <span className="muted">Total en stock</span>
              <strong>
                {item.quantity} <small>{item.unit}</small>
              </strong>
            </div>
            {item.target > 0 && (
              <div className="quick-target">
                <span className="muted">Seuil</span>
                <strong>{item.target}</strong>
              </div>
            )}
          </div>
          <Forecast item={item} history={props.history} onSetTarget={props.onSetTarget} />
          <VariantList {...props} item={item} />
          {props.historySlot && (
            <details className="item-history">
              <summary>Derniers mouvements</summary>
              {props.historySlot}
            </details>
          )}
        </>
      )}

      {!item && draft?.barcode && (
        <p className="banner info">
          Code {draft.barcode} pas encore dans le cellier : complétez la fiche pour l’ajouter.
        </p>
      )}

      <h3 className="group-title">{item ? 'Réglages de l’article' : 'Article'}</h3>

      <label className="field">
        <span>Nom de l’article {looking && <em className="muted">· recherche du produit…</em>}</span>
        <input
          value={group.name}
          onChange={(e) => setG('name', e.target.value)}
          placeholder="Ex. Jus de pomme, Côtes-du-Rhône…"
          autoFocus={!item}
          enterKeyHint="done"
        />
      </label>

      {!item && (
        <>
          <label className="field">
            <span>Marque / précision (optionnel)</span>
            <input
              value={first.label}
              onChange={(e) => setFirst((f) => ({ ...f, label: e.target.value }))}
              placeholder="Ex. Pago 1 L, Château X 2019…"
            />
          </label>
          <p className="hint">
            Plusieurs marques d’un même produit ? Gardez un nom générique (« Jus de pomme ») : les autres marques
            s’ajouteront dedans au scan.
          </p>
          <div className="field">
            <span>Quantité actuelle</span>
            <Stepper value={first.quantity} onChange={(v) => setFirst((f) => ({ ...f, quantity: v }))} big />
          </div>
          <ExtrasFields value={firstExtras} onChange={setFirstExtras} isWine={group.category === 'Vin'} />
        </>
      )}

      <div className="field">
        <span>Catégorie</span>
        <div className="chips wrap">
          {allCategories.map((c) => (
            <button type="button" key={c} className={`chip${group.category === c ? ' on' : ''}`} onClick={() => setG('category', c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <span>Seuil d’alerte (min.)</span>
          <Stepper value={group.target ?? 0} onChange={(v) => setG('target', v)} />
        </div>
        <label className="field">
          <span>Unité</span>
          <select value={group.unit} onChange={(e) => setG('unit', e.target.value)}>
            {Array.from(new Set([...UNITS, group.unit ?? 'pcs'])).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">
        Alerte quand le total passe sous {group.target || '…'} {group.unit}.
      </p>

      <label className="field">
        <span>Emplacement</span>
        <input value={group.location ?? ''} onChange={(e) => setG('location', e.target.value)} placeholder="Ex. Étagère du haut" list="locations" />
        <datalist id="locations">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

      {!item && (
        <label className="field">
          <span>Code-barres</span>
          <input
            value={first.barcode}
            onChange={(e) => setFirst((f) => ({ ...f, barcode: e.target.value }))}
            placeholder="Scanner ou saisir"
            inputMode="numeric"
          />
        </label>
      )}
    </Sheet>
  );
}

/** Détail des références (marques) d'un article, avec leurs quantités. */
function variantMeta(v: Variant) {
  const parts: ReactNode[] = [];
  if (v.location) parts.push(<span key="l">{v.location}</span>);
  if (v.expiry) {
    const st = expiryState(v.expiry);
    parts.push(
      <span key="e" className={st === 'expired' ? 'out-text' : st === 'soon' ? 'low-text' : undefined}>
        {st === 'ok' ? `DLC ${new Date(v.expiry).toLocaleDateString('fr-FR')}` : expiryLabel(v.expiry)}
      </span>,
    );
  }
  if (v.price) parts.push(<span key="p">{euro(v.price)}</span>);
  const w = v.wine;
  if (w?.vintage) parts.push(<span key="v">{w.vintage}</span>);
  if (w?.rating) parts.push(<span key="r">{'★'.repeat(w.rating)}</span>);
  const dw = drinkWindow(w);
  if (dw) parts.push(<span key="d" className={dw === 'ready' ? 'in-text' : dw === 'past' ? 'low-text' : undefined}>{dw === 'ready' ? 'à boire' : dw === 'wait' ? `garder jusqu’en ${w!.drinkFrom}` : 'à boire vite'}</span>);
  return parts;
}

/** Rythme de consommation, date de rupture estimée et seuil conseillé, d'après l'historique. */
function Forecast({ item, history, onSetTarget }: { item: Item; history?: Movement[] | null; onSetTarget?: (t: number) => void }) {
  if (!history) return null;
  const f = forecast(item, history);
  if (!f) return null;
  const days = Math.round(f.daysLeft);
  const suggested = suggestedTarget(f.perMonth);
  const perMonth = f.perMonth >= 10 ? Math.round(f.perMonth) : Math.round(f.perMonth * 10) / 10;
  return (
    <div className="forecast card">
      <div>
        <span className="muted">Consommation</span>
        <strong>
          ~{String(perMonth).replace('.', ',')} / mois
        </strong>
      </div>
      <div>
        <span className="muted">Rupture estimée</span>
        <strong className={days <= 7 ? 'out-text' : days <= 21 ? 'low-text' : undefined}>
          {item.quantity === 0 ? 'déjà' : days > 365 ? '> 1 an' : `dans ~${days} j`}
        </strong>
      </div>
      {onSetTarget && suggested !== item.target && (
        <button className="btn small ghost" onClick={() => onSetTarget(suggested)}>
          Seuil conseillé : {suggested}
        </button>
      )}
    </div>
  );
}

function VariantList({ item, onAdjust, onAddVariant, onUpdateVariant, onRemoveVariant }: Props & { item: Item }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <section className="variants">
      <div className="variants-head">
        <h3 className="group-title">Références</h3>
        <span className="muted">{item.variants.length > 1 ? `${item.variants.length} marques / codes` : ''}</span>
      </div>
      <ul>
        {item.variants.map((v) =>
          editing === v.id ? (
            <VariantForm
              key={v.id}
              isWine={item.category === 'Vin'}
              initial={v}
              onCancel={() => setEditing(null)}
              onSave={async (patch) => {
                await onUpdateVariant?.(v.id, patch);
                setEditing(null);
              }}
              onDelete={
                item.variants.length > 1
                  ? async () => {
                      await onRemoveVariant?.(v.id);
                      setEditing(null);
                    }
                  : undefined
              }
            />
          ) : (
            <li key={v.id} className="variant">
              <button className="variant-main" onClick={() => setEditing(v.id)}>
                <ItemThumb category={item.category} imageUrl={v.imageUrl} size={38} />
                <div className="row-text">
                  <div className="variant-name">{v.label.trim() || <span className="muted">Sans précision</span>}</div>
                  <div className="row-meta wrap">
                    {v.barcode ? <span className="mono">{v.barcode}</span> : <span>Pas de code-barres</span>}
                    {variantMeta(v)}
                    <Icon name="edit" size={12} />
                  </div>
                </div>
              </button>
              <div className="row-qty">
                <button className="qty-btn sm" onClick={() => onAdjust?.(v.id, -1)} disabled={v.quantity <= 0} aria-label={`Retirer ${variantLabel(item, v)}`}>
                  <Icon name="minus" size={16} />
                </button>
                <div className="qty sm">
                  <strong>{v.quantity}</strong>
                </div>
                <button className="qty-btn sm plus" onClick={() => onAdjust?.(v.id, 1)} aria-label={`Ajouter ${variantLabel(item, v)}`}>
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </li>
          ),
        )}
        {adding && (
          <VariantForm
            withQuantity
            isWine={item.category === 'Vin'}
            onCancel={() => setAdding(false)}
            onSave={async ({ quantity, ...patch }) => {
              await onAddVariant?.({
                ...patch,
                id: newId(),
                label: patch.label ?? '',
                quantity: quantity ?? 0,
                createdAt: Date.now(),
              });
              setAdding(false);
            }}
          />
        )}
      </ul>
      {!adding && (
        <button className="btn small ghost add-ref" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> Ajouter une marque / un code
        </button>
      )}
    </section>
  );
}

function VariantForm({
  initial,
  withQuantity,
  isWine,
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Variant;
  withQuantity?: boolean;
  isWine: boolean;
  onSave: (patch: { label?: string; barcode?: string; quantity?: number } & VariantExtras) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [quantity, setQuantity] = useState(1);
  const [extras, setExtras] = useState<VariantExtras>({
    location: initial?.location,
    expiry: initial?.expiry,
    price: initial?.price,
    wine: initial?.wine,
  });
  return (
    <li className="variant-form">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Marque / précision" autoFocus />
      <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Code-barres (optionnel)" inputMode="numeric" />
      {withQuantity && <Stepper value={quantity} onChange={setQuantity} />}
      <ExtrasFields value={extras} onChange={setExtras} isWine={isWine} />
      <div className="variant-form-actions">
        {onDelete && (
          <button className="btn small ghost danger-text" onClick={onDelete} aria-label="Supprimer cette référence">
            <Icon name="trash" size={16} />
          </button>
        )}
        <button className="btn small ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          className="btn small primary"
          onClick={() =>
            onSave({ label: label.trim(), barcode: barcode.trim() || undefined, ...cleanExtras(extras), ...(withQuantity ? { quantity } : {}) })
          }
        >
          OK
        </button>
      </div>
    </li>
  );
}
