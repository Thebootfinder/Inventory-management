import { variantLabel, type Item, type Movement } from '../types';

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  // Point-virgule : séparateur attendu par Excel en français.
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

export function toCsv(rows: unknown[][]) {
  // BOM pour qu'Excel reconnaisse l'UTF-8 (accents).
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
}

/** Une ligne par référence (marque), avec le total de l'article. */
export function inventoryCsv(items: Item[]) {
  const rows: unknown[][] = [
    ['Article', 'Référence', 'Catégorie', 'Emplacement', 'Quantité', 'Unité', 'Total article', 'Seuil', 'Code-barres', 'Péremption', 'Prix unitaire (€)', 'Millésime', 'Appellation', 'Couleur', 'Note'],
  ];
  for (const i of items)
    for (const v of i.variants)
      rows.push([
        i.name,
        variantLabel(i, v),
        i.category,
        v.location || i.location || '',
        v.quantity,
        i.unit,
        i.quantity,
        i.target,
        v.barcode ?? '',
        v.expiry ?? '',
        num(v.price),
        v.wine?.vintage ?? '',
        v.wine?.appellation ?? '',
        v.wine?.color ?? '',
        v.wine?.rating ?? '',
      ]);
  return toCsv(rows);
}

export function historyCsv(movements: Movement[]) {
  const rows: unknown[][] = [['Date', 'Heure', 'Article', 'Référence', 'Catégorie', 'Mouvement', 'Motif', 'Par', 'Prix unitaire (€)']];
  for (const m of movements) {
    const d = new Date(m.at);
    rows.push([
      d.toLocaleDateString('fr-FR'),
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      m.itemName,
      m.variantLabel ?? '',
      m.category,
      m.delta,
      m.reason,
      m.by,
      num(m.price),
    ]);
  }
  return toCsv(rows);
}

/** Partage (téléphone) ou télécharge (ordinateur) un fichier. Renvoie false si l'utilisateur a annulé. */
export async function saveFile(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
