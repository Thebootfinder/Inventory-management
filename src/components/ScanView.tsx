import { useEffect, useRef, useState } from 'react';
import { startScanner, type ScanSession } from '../scanner';
import type { Item } from '../types';
import { Icon } from './Icon';

export type ScanMode = 'in' | 'out' | 'look';

interface Flash {
  key: number;
  text: string;
  tone: 'in' | 'out' | 'warn';
}

export function ScanView({
  items,
  initialMode,
  onClose,
  onAdjust,
  onFound,
  onUnknown,
}: {
  items: Item[];
  initialMode: ScanMode;
  onClose: (mode: ScanMode) => void;
  onAdjust: (item: Item, delta: number) => void;
  onFound: (item: Item) => void;
  onUnknown: (code: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const session = useRef<ScanSession | null>(null);
  const [mode, setMode] = useState<ScanMode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');

  // Les callbacks lisent toujours l'état le plus récent sans relancer la caméra.
  const latest = useRef({ items, mode, onAdjust, onFound, onUnknown });
  latest.current = { items, mode, onAdjust, onFound, onUnknown };
  const lastScan = useRef({ code: '', at: 0 });

  const handle = (raw: string) => {
    const value = raw.trim();
    const now = Date.now();
    // Un même code reste visible plusieurs images de suite : on l'ignore pendant 1,5 s.
    if (value === lastScan.current.code && now - lastScan.current.at < 1500) return;
    lastScan.current = { code: value, at: now };
    const { items, mode, onAdjust, onFound, onUnknown } = latest.current;
    navigator.vibrate?.(40);
    const item = items.find((i) => i.barcode === value);
    if (!item) return onUnknown(value);
    if (mode === 'look') return onFound(item);
    if (mode === 'out' && item.quantity <= 0) {
      setFlash({ key: now, tone: 'warn', text: `${item.name} : déjà en rupture` });
      return;
    }
    const delta = mode === 'in' ? 1 : -1;
    onAdjust(item, delta);
    const next = item.quantity + delta;
    const warn = item.target > 0 && next < item.target;
    setFlash({
      key: now,
      tone: warn ? 'warn' : mode,
      text: `${delta > 0 ? '+1' : '−1'} ${item.name} → ${next}${warn ? ' · stock bas' : ''}`,
    });
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

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
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  const toggleTorch = async () => {
    const s = session.current;
    if (!s) return;
    setTorch(await s.setTorch(!torch));
  };

  return (
    <div className="scan">
      <video ref={videoRef} className="scan-video" playsInline muted />
      <div className="scan-shade" />

      <header className="scan-top">
        <button className="icon-btn glass" onClick={() => onClose(mode)} aria-label="Fermer le scanner">
          <Icon name="close" />
        </button>
        <div className="seg glass" role="tablist" aria-label="Action au scan">
          {(
            [
              ['in', 'Entrée +1'],
              ['out', 'Sortie −1'],
              ['look', 'Fiche'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`seg-${m}${mode === m ? ' on' : ''}`} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
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

      <div className={`scan-frame mode-${mode}`}>
        <span />
        <span />
        <span />
        <span />
        <i className="scan-laser" />
      </div>

      <div className="scan-bottom">
        {flash ? (
          <div key={flash.key} className={`scan-flash tone-${flash.tone}`}>
            {flash.text}
          </div>
        ) : (
          <p className="scan-help">
            {error ??
              (mode === 'look'
                ? 'Visez un code-barres pour ouvrir sa fiche'
                : `Chaque scan ${mode === 'in' ? 'ajoute' : 'retire'} 1 unité. Scannez en continu.`)}
          </p>
        )}

        {manual ? (
          <form
            className="manual glass"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) handle(code);
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
        )}
      </div>
    </div>
  );
}
