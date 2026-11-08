import { useEffect, useState } from 'react';
import { lookupProduct } from '../scanner';
import { DEFAULT_CATEGORIES, stockLevel, type Item, type ItemInput } from '../types';
import { Icon, ItemThumb } from './Icon';
import { Sheet } from './Sheet';
import { Stepper } from './Stepper';

const UNITS = ['pcs', 'bouteilles', 'canettes', 'boîtes', 'paquets', 'kg', 'L'];

export function ItemSheet({
  item,
  barcode,
  categories,
  locations,
  onClose,
  onSave,
  onDelete,
  onAdjust,
}: {
  item?: Item;
  barcode?: string;
  categories: string[];
  locations: string[];
  onClose: () => void;
  onSave: (input: ItemInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onAdjust?: (delta: number) => void;
}) {
  const [form, setForm] = useState<ItemInput>(() =>
    item
      ? { name: item.name, barcode: item.barcode, category: item.category, location: item.location, quantity: item.quantity, target: item.target, unit: item.unit, imageUrl: item.imageUrl }
      : { name: '', barcode, category: 'Vin', location: '', quantity: 1, target: 2, unit: 'bouteilles' },
  );
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Nouveau produit scanné : on tente de pré-remplir le nom depuis Open Food Facts.
  useEffect(() => {
    if (item || !barcode) return;
    let alive = true;
    setLooking(true);
    lookupProduct(barcode).then((info) => {
      if (!alive) return;
      setLooking(false);
      if (info)
        setForm((f) => ({
          ...f,
          name: f.name || info.name || '',
          imageUrl: info.imageUrl,
          category: info.category ?? f.category,
          unit: info.category && !['Vin', 'Spiritueux'].includes(info.category) ? 'pcs' : f.unit,
        }));
    });
    return () => {
      alive = false;
    };
  }, [item, barcode]);

  const allCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...categories]));
  const valid = form.name.trim().length > 0;
  const live = item ? { ...item } : null;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ ...form, name: form.name.trim(), location: form.location?.trim() || undefined, barcode: form.barcode?.trim() || undefined });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={item ? 'Modifier l’article' : 'Nouvel article'}
      onClose={onClose}
      footer={
        <>
          {onDelete &&
            (confirmDelete ? (
              <button className="btn danger" onClick={onDelete}>
                Confirmer
              </button>
            ) : (
              <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)} aria-label="Supprimer">
                <Icon name="trash" size={18} />
              </button>
            ))}
          <button className="btn primary grow" disabled={!valid || saving} onClick={submit}>
            {saving ? 'Enregistrement…' : item ? 'Enregistrer' : 'Ajouter au stock'}
          </button>
        </>
      }
    >
      {live && onAdjust && (
        <div className={`quick level-${stockLevel(live)}`}>
          <ItemThumb category={live.category} imageUrl={live.imageUrl} size={52} />
          <div className="quick-qty">
            <span className="muted">En stock</span>
            <strong>
              {live.quantity} <small>{live.unit}</small>
            </strong>
          </div>
          <div className="quick-btns">
            <button className="qty-btn big" onClick={() => onAdjust(-1)} disabled={live.quantity <= 0} aria-label="Retirer">
              <Icon name="minus" size={22} />
            </button>
            <button className="qty-btn big plus" onClick={() => onAdjust(1)} aria-label="Ajouter">
              <Icon name="plus" size={22} />
            </button>
          </div>
        </div>
      )}

      {!item && barcode && (
        <p className="banner info">Code {barcode} pas encore dans le cellier : complétez la fiche pour l’ajouter.</p>
      )}
      <label className="field">
        <span>Nom {looking && <em className="muted">· recherche du produit…</em>}</span>
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Ex. Côtes-du-Rhône 2021"
          autoFocus={!item}
          enterKeyHint="done"
        />
      </label>

      <div className="field">
        <span>Catégorie</span>
        <div className="chips wrap">
          {allCategories.map((c) => (
            <button type="button" key={c} className={`chip${form.category === c ? ' on' : ''}`} onClick={() => set('category', c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {!item && (
        <div className="field">
          <span>Quantité actuelle</span>
          <Stepper value={form.quantity} onChange={(v) => set('quantity', v)} big />
        </div>
      )}

      <div className="grid2">
        <div className="field">
          <span>Seuil d’alerte (min.)</span>
          <Stepper value={form.target} onChange={(v) => set('target', v)} />
        </div>
        <label className="field">
          <span>Unité</span>
          <select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {Array.from(new Set([...UNITS, form.unit])).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="hint">Alerte quand le stock passe sous {form.target || '…'} {form.unit}.</p>

      <label className="field">
        <span>Emplacement</span>
        <input
          value={form.location ?? ''}
          onChange={(e) => set('location', e.target.value)}
          placeholder="Ex. Étagère du haut"
          list="locations"
        />
        <datalist id="locations">
          {locations.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </label>

      <label className="field">
        <span>Code-barres</span>
        <input
          value={form.barcode ?? ''}
          onChange={(e) => set('barcode', e.target.value)}
          placeholder="Scanner ou saisir"
          inputMode="numeric"
        />
      </label>
    </Sheet>
  );
}
