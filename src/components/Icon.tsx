const paths: Record<string, string> = {
  scan: 'M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M7 9v6M10 9v6M13 9v6M17 9v6',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  close: 'M18 6 6 18M6 6l12 12',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  torch: 'M9 2h6l-1 7h-4zM10 9h4v13h-4z',
  share: 'M4 12v8h16v-8M16 6l-4-4-4 4M12 2v14',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  check: 'M20 6 9 17l-5-5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cloud: 'M17.5 19H7a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 11a4 4 0 0 1-1.5 8z',
  offline: 'M2 2l20 20M17.5 19H7a5 5 0 0 1-1.6-9.7M9.5 5.6A6 6 0 0 1 19 11a4 4 0 0 1 2 6.5',
  device: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

const CATEGORY_EMOJI: Record<string, string> = {
  Vin: '🍷',
  Bière: '🍺',
  Spiritueux: '🥃',
  Boissons: '🧃',
  Conserves: '🥫',
  Épicerie: '🫙',
  Surgelés: '🧊',
  Entretien: '🧴',
};

export function ItemThumb({ category, imageUrl, size = 44 }: { category: string; imageUrl?: string; size?: number }) {
  return (
    <div className="thumb" style={{ width: size, height: size }}>
      {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>{CATEGORY_EMOJI[category] ?? '📦'}</span>}
    </div>
  );
}
