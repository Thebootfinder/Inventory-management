import { useEffect, useMemo, useRef, useState } from 'react';
import { lookupProduct, startScanner, type ProductInfo, type ScanSession } from '../scanner';
import { findByBarcode, itemImage, newId, stockLevel, variantLabel, type Item, type Variant } from '../types';
import { Icon, ItemThumb } from './Icon';
import { Stepper } from './Stepper';

type Pending =
  | { kind: 'known'; itemId: string; variantId: string }
  | { kind: 'unknown'; code: string; info?: ProductInfo | null; attach?: boolean };

interface Flash {
  key: number;
  text: string;
  tone: 'in' | 'out' | 'warn';
}

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function ScanView({
  items,
  onClose,
  onAdjust,
  onOpen,
  onCreate,
  onAddVariant,
}: {
  items: Item[];
  onClose: () => void;
  onAdjust: (item: Item, variantId: string, delta: number) => void;
  onOpen: (item: Item) => void;
  onCreate: (code: string, info: ProductInfo | null | undefined) => void;
  onAddVariant: (item: Item, variant: Variant) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<ScanSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);

  // Les callbacks de la caméra lisent toujours l'état le plus récent sans la relancer.
  const latest = useRef({ items, pending });
  latest.current = { items, pending };
  const lastScan = useRef({ code: '', at: 0 });

  const handle = (raw: string) => {
    const value = raw.trim();
    const now = Date.now();
    // Une fiche est ouverte : on n'écoute plus la caméra tant qu'elle n'est pas validée ou annulée.
    if (!value || latest.current.pending) return;
    // Un même code reste visible plusieurs images de suite : on l'ignore pendant 2,5 s.
    if (value === lastScan.current.code && now - lastScan.current.at < 2500) return;
    lastScan.current = { code: value, at: now };
    navigator.vibrate?.(40);
    const found = findByBarcode(latest.current.items, value);
    if (found) {
      setPending({ kind: 'known', itemId: found.item.id, variantId: found.variant.id });
      return;
    }
    setPending({ kind: 'unknown', code: value });
    lookupProduct(value).then((info) =>
      setPending((p) => (p?.kind === 'unknown' && p.code === value ? { ...p, info } : p)),
    );
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const resume = () => {
    lastScan.current.at = Date.now();
    setPending(null);
  };

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current!;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La caméra n’est pas accessible dans ce navigateur. Saisissez le code à la main.');
      setManual(true);
      return;
    }
    startScanner(video, (c) => handleRef.current(c))
      .then((s) => {
        if (cancelled) return s.stop();
        session.current = s;
        setHasTorch(s.hasTorch);
      })
      .catch((e: Error) => {
        setError(
          e.name === 'NotAllowedError'
            ? 'Accès à la caméra refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le code.'
            : 'Impossible de démarrer la caméra. Saisissez le code à la main.',
        );
        setManual(true);
      });
    return () => {
      cancelled = true;
      session.current?.stop();
      session.current = null;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const toggleTorch = async () => {
    const s = session.current;
    if (s) setTorch(await s.setTorch(!torch));
  };

  const known =
    pending?.kind === 'known'
      ? (() => {
          const item = items.find((i) => i.id === pending.itemId);
          const variant = item?.variants.find((v) => v.id === pending.variantId);
          return item && variant ? { item, variant } : null;
        })()
      : null;

  const confirm = (item: Item, variant: Variant, delta: number) => {
    onAdjust(item, variant.id, delta);
    const next = item.quantity + delta;
    const warn = item.target > 0 && next < item.target;
    const name = item.variants.length > 1 ? `${item.name} (${variantLabel(item, variant)})` : item.name;
    setFlash({
      key: Date.now(),
      tone: warn ? 'warn' : delta > 0 ? 'in' : 'out',
      text: `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${name} · total ${next}${warn ? ' · stock bas' : ''}`,
    });
    resume();
  };

  return (
    <div className="scan">
      <video ref={videoRef} className="scan-video" playsInline muted />
      <div className="scan-shade" />

      <header className="scan-top">
        <button className="icon-btn glass" onClick={onClose} aria-label="Fermer le scanner">
          <Icon name="close" />
        </button>
        <span className="scan-title glass">Scanner</span>
        <button
          className={`icon-btn glass${torch ? ' lit' : ''}`}
          onClick={toggleTorch}
          disabled={!hasTorch}
          aria-label="Lampe torche"
          style={{ visibility: hasTorch ? 'visible' : 'hidden' }}
        >
          <Icon name="torch" />
        </button>
      </header>

      <div className={`scan-frame${pending ? ' paused' : ''}`}>
        <span />
        <span />
        <span />
        <span />
        {!pending && <i className="scan-laser" />}
      </div>

      <div className="scan-bottom">
        {pending ? null : flash ? (
          <div key={flash.key} className={`scan-flash tone-${flash.tone}`}>
            {flash.text}
          </div>
        ) : (
          <p className="scan-help">{error ?? 'Visez un code-barres. Vous validerez l’ajout ou le retrait ensuite.'}</p>
        )}

        {!pending &&
          (manual ? (
            <form
              className="manual glass"
              onSubmit={(e) => {
                e.preventDefault();
                lastScan.current.code = '';
                handle(code);
                setCode('');
              }}
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="Code-barres" autoFocus />
              <button className="btn primary" type="submit">
                OK
              </button>
            </form>
          ) : (
            <button className="btn glass" onClick={() => setManual(true)}>
              <Icon name="keyboard" size={18} /> Saisir le code
            </button>
          ))}
      </div>

      {known && (
        <KnownCard
          key={`${known.item.id}-${known.variant.id}`}
          item={known.item}
          variant={known.variant}
          onConfirm={(d) => confirm(known.item, known.variant, d)}
          onOpen={() => onOpen(known.item)}
          onCancel={resume}
        />
      )}
      {pending?.kind === 'unknown' && (
        <UnknownCard
          pending={pending}
          items={items}
          onCancel={resume}
          onCreate={() => onCreate(pending.code, pending.info)}
          onAttachMode={(attach) => setPending({ ...pending, attach })}
          onAttach={async (item, label) => {
            const variant: Variant = {
              id: newId(),
              label,
              barcode: pending.code,
              quantity: 0,
              imageUrl: pending.info?.imageUrl,
              createdAt: Date.now(),
            };
            await onAddVariant(item, variant);
            setPending({ kind: 'known', itemId: item.id, variantId: variant.id });
          }}
        />
      )}
    </div>
  );
}

function KnownCard({
  item,
  variant,
  onConfirm,
  onOpen,
  onCancel,
}: {
  item: Item;
  variant: Variant;
  onConfirm: (delta: number) => void;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(1);
  const level = stockLevel(item);
  const multi = item.variants.length > 1;
  return (
    <div className="scan-card" role="dialog" aria-label="Valider le mouvement de stock">
      <div className="scan-card-head">
        <ItemThumb category={item.category} imageUrl={variant.imageUrl ?? itemImage(item)} size={56} />
        <div className="row-text">
          <div className="scan-card-name">{item.name}</div>
          {variant.label.trim() && <div className="muted ellipsis">{variant.label}</div>}
          <div className="row-meta">
            {level === 'out' && <span className="pill out">Rupture</span>}
            {level === 'low' && <span className="pill low">Stock bas</span>}
            <span>
              En stock : <b>{item.quantity}</b>
              {multi && ` (dont ${variant.quantity} de celle-ci)`}
            </span>
          </div>
        </div>
        <button className="icon-btn" onClick={onOpen} aria-label="Ouvrir la fiche">
          <Icon name="chevron" />
        </button>
      </div>
      <div className="field">
        <span>Quantité</span>
        <Stepper value={amount} onChange={setAmount} min={1} big />
      </div>
      <div className="scan-card-actions">
        <button className="btn out-btn" onClick={() => onConfirm(-Math.min(amount, variant.quantity))} disabled={variant.quantity <= 0}>
          <Icon name="minus" size={18} /> Retirer
        </button>
        <button className="btn in-btn" onClick={() => onConfirm(amount)}>
          <Icon name="plus" size={18} /> Ajouter
        </button>
      </div>
      <button className="btn ghost full" onClick={onCancel}>
        Annuler · scanner un autre produit
      </button>
    </div>
  );
}

function UnknownCard({
  pending,
  items,
  onCancel,
  onCreate,
  onAttachMode,
  onAttach,
}: {
  pending: Extract<Pending, { kind: 'unknown' }>;
  items: Item[];
  onCancel: () => void;
  onCreate: () => void;
  onAttachMode: (on: boolean) => void;
  onAttach: (item: Item, label: string) => Promise<void>;
}) {
  const { code, info, attach } = pending;
  const [query, setQuery] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (info?.name) setLabel((l) => l || info.name!);
  }, [info]);

  // Suggestions : les articles dont le nom partage des mots avec le produit scanné passent en premier.
  const ranked = useMemo(() => {
    const words = normalize(`${info?.generic ?? ''} ${info?.name ?? ''}`)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);
    const q = normalize(query.trim());
    return items
      .filter((i) => !q || normalize(i.name).includes(q))
      .map((i) => {
        const n = normalize(i.name);
        return { item: i, score: words.filter((w) => n.includes(w)).length + (i.category === info?.category ? 0.5 : 0) };
      })
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'fr'));
  }, [items, info, query]);

  if (attach) {
    return (
      <div className="scan-card tall" role="dialog" aria-label="Rattacher à un article">
        <div className="scan-card-title">
          <button className="icon-btn" onClick={() => onAttachMode(false)} aria-label="Retour">
            <Icon name="chevron" />
          </button>
          <h3>Ranger dans quel article ?</h3>
        </div>
        <label className="field">
          <span>Marque / précision de ce produit</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Pago 1 L" />
        </label>
        <label className="search">
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Chercher un article…" />
        </label>
        <ul className="pick-list">
          {ranked.map(({ item, score }) => (
            <li key={item.id}>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onAttach(item, label.trim());
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <ItemThumb category={item.category} imageUrl={itemImage(item)} size={36} />
                <span className="pick-name">{item.name}</span>
                {score >= 1 && <span className="pill refs">Suggéré</span>}
                <span className="muted">{item.quantity}</span>
              </button>
            </li>
          ))}
          {!ranked.length && <li className="muted pick-empty">Aucun article ne correspond.</li>}
        </ul>
      </div>
    );
  }

  return (
    <div className="scan-card" role="dialog" aria-label="Produit inconnu">
      <div className="scan-card-head">
        <ItemThumb category={info?.category ?? 'Autre'} imageUrl={info?.imageUrl} size={56} />
        <div className="row-text">
          <div className="scan-card-name">
            {info === undefined ? 'Recherche du produit…' : info?.name ?? 'Produit non référencé'}
          </div>
          <div className="row-meta">
            <span className="pill low">Nouveau</span>
            <span className="mono">{code}</span>
          </div>
        </div>
      </div>
      {info === null && (
        <p className="hint">
          Absent de la base Open Food Facts : donnez-lui un nom une fois, il sera reconnu à chaque scan.{' '}
          <a href={`https://world.openfoodfacts.org/product/${code}`} target="_blank" rel="noreferrer">
            L’ajouter à Open Food Facts
          </a>
        </p>
      )}
      <div className="scan-card-actions col">
        {items.length > 0 && (
          <button className="btn primary" onClick={() => onAttachMode(true)}>
            Ranger dans un article existant
          </button>
        )}
        <button className={`btn ${items.length ? 'ghost' : 'primary'}`} onClick={onCreate}>
          <Icon name="plus" size={18} /> Créer un nouvel article
        </button>
      </div>
      <button className="btn ghost full" onClick={onCancel}>
        Annuler
      </button>
    </div>
  );
}
