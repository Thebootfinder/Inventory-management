import { useEffect, useState, type ReactNode } from 'react';
import { lookupProduct, type ProductInfo } from '../scanner';
import {
  DEFAULT_CATEGORIES,
  itemImage,
  newId,
  stockLevel,
  variantLabel,
  type Item,
  type ItemInput,
  type ItemPatch,
  type Variant,
} from '../types';
import { Icon, ItemThumb } from './Icon';
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
  historySlot?: ReactNode;
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
                  <div className="row-meta">
                    {v.barcode ? <span className="mono">{v.barcode}</span> : <span>Pas de code-barres</span>}
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
            onCancel={() => setAdding(false)}
            onSave={async (patch) => {
              await onAddVariant?.({
                id: newId(),
                label: patch.label ?? '',
                barcode: patch.barcode,
                quantity: patch.quantity ?? 0,
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
  onSave,
  onCancel,
  onDelete,
}: {
  initial?: Variant;
  withQuantity?: boolean;
  onSave: (patch: { label?: string; barcode?: string; quantity?: number }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [barcode, setBarcode] = useState(initial?.barcode ?? '');
  const [quantity, setQuantity] = useState(1);
  return (
    <li className="variant-form">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Marque / précision" autoFocus />
      <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Code-barres (optionnel)" inputMode="numeric" />
      {withQuantity && <Stepper value={quantity} onChange={setQuantity} />}
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
          onClick={() => onSave({ label: label.trim(), barcode: barcode.trim() || undefined, ...(withQuantity ? { quantity } : {}) })}
        >
          OK
        </button>
      </div>
    </li>
  );
}
