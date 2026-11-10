import { newId, type Item, type ItemInput, type Movement, type Variant } from '../types';
import type { RestoreMode } from '../store/types';

/** Format du fichier de sauvegarde. v3 ajoute les identifiants et l'historique. */
export interface Backup {
  app: 'cellier';
  version: 3;
  exportedAt: string;
  items: (ItemInput & { id: string })[];
  history: Movement[];
}

export function makeBackup(items: Item[], history: Movement[]): Backup {
  return {
    app: 'cellier',
    version: 3,
    exportedAt: new Date().toISOString(),
    items: items.map(({ id, name, category, location, target, unit, variants }) => ({ id, name, category, location, target, unit, variants })),
    history,
  };
}

export interface ParsedBackup {
  items: (ItemInput & { id?: string })[];
  history: Movement[];
}

/** Lit une sauvegarde (v1 : tableau d'articles, v2 : sans historique, v3). Lève une erreur si le fichier n'en est pas une. */
export function parseBackup(text: string): ParsedBackup {
  const data = JSON.parse(text) as unknown;
  const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  if (!Array.isArray(list) || list.some((i) => typeof (i as { name?: unknown })?.name !== 'string')) {
    throw new Error('Ce fichier n’est pas une sauvegarde du cellier.');
  }
  const history = Array.isArray((data as { history?: unknown })?.history) ? ((data as { history: Movement[] }).history) : [];
  const items = (list as Record<string, unknown>[]).map((raw) => {
    const variants: Variant[] = Array.isArray(raw.variants)
      ? (raw.variants as Variant[]).map((v) => ({ ...v, id: v.id || newId(), quantity: Math.max(0, Number(v.quantity) || 0) }))
      : [
          {
            id: newId(),
            label: '',
            barcode: (raw.barcode as string) || undefined,
            quantity: Math.max(0, Number(raw.quantity) || 0),
            imageUrl: (raw.imageUrl as string) || undefined,
            createdAt: Date.now(),
          },
        ];
    return {
      id: typeof raw.id === 'string' ? raw.id : undefined,
      name: String(raw.name),
      category: String(raw.category ?? 'Autre'),
      location: (raw.location as string) || undefined,
      target: Math.max(0, Number(raw.target) || 0),
      unit: String(raw.unit ?? 'pcs'),
      variants,
    };
  });
  return { items, history: history.filter((m) => m && typeof m.id === 'string' && typeof m.delta === 'number') };
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

export interface RestorePlan {
  deletes: string[];
  creates: { id?: string; input: ItemInput }[];
  /** Articles existants dont on remplace les champs et les références. */
  updates: { id: string; input: ItemInput }[];
}

/**
 * Prépare une restauration.
 * - `replace` : tout l'inventaire actuel est effacé, la sauvegarde est recréée avec ses identifiants.
 * - `merge` : un article de la sauvegarde qui existe déjà (même identifiant, même code-barres ou même nom)
 *   est mis à jour (références ajoutées, quantités de la sauvegarde) ; les autres sont créés. Rien n'est effacé.
 */
export function planRestore(current: Item[], incoming: (ItemInput & { id?: string })[], mode: RestoreMode): RestorePlan {
  if (mode === 'replace') {
    return {
      deletes: current.map((i) => i.id),
      creates: incoming.map(({ id, ...input }) => ({ id, input })),
      updates: [],
    };
  }
  const plan: RestorePlan = { deletes: [], creates: [], updates: [] };
  const byId = new Map(current.map((i) => [i.id, i]));
  const used = new Set<string>();
  for (const { id, ...input } of incoming) {
    const codes = new Set(input.variants.map((v) => v.barcode).filter(Boolean));
    const match =
      (id && byId.get(id)) ||
      current.find((i) => !used.has(i.id) && i.variants.some((v) => v.barcode && codes.has(v.barcode))) ||
      current.find((i) => !used.has(i.id) && norm(i.name) === norm(input.name));
    if (!match || used.has(match.id)) {
      plan.creates.push({ id: id && !byId.has(id) ? id : undefined, input });
      continue;
    }
    used.add(match.id);
    // Références : celles de la sauvegarde font foi ; on garde en plus les références actuelles absentes de la sauvegarde.
    const variants = [...input.variants];
    for (const v of match.variants) {
      const same = variants.some((w) => w.id === v.id || (v.barcode && w.barcode === v.barcode) || (!v.barcode && !w.barcode && norm(w.label) === norm(v.label)));
      if (!same) variants.push(v);
    }
    plan.updates.push({ id: match.id, input: { ...input, variants } });
  }
  return plan;
}
