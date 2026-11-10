import { describe, expect, it } from 'vitest';
import { daysUntil, drinkWindow, expiryState, forecast, nextExpiry, stockLevel, stockValue, suggestedTarget, type Item, type Movement, type Variant } from '../src/types';
import { makeBackup, parseBackup, planRestore } from '../src/lib/backup';
import { inventoryCsv, toCsv } from '../src/lib/csv';

const day = 864e5;
const NOW = new Date(2026, 10, 10, 12).getTime();

const variant = (p: Partial<Variant> = {}): Variant => ({ id: 'v1', label: '', quantity: 3, createdAt: 0, ...p });
const item = (p: Partial<Item> = {}): Item => {
  const variants = p.variants ?? [variant()];
  return {
    id: 'a',
    name: 'Jus de pomme',
    category: 'Boissons',
    target: 2,
    unit: 'briques',
    updatedAt: 0,
    ...p,
    variants,
    quantity: variants.reduce((n, v) => n + v.quantity, 0),
  };
};
const mv = (p: Partial<Movement>): Movement => ({
  id: Math.random().toString(36),
  at: NOW,
  itemId: 'a',
  itemName: 'Jus de pomme',
  category: 'Boissons',
  delta: -1,
  reason: 'manuel',
  by: 'Martin',
  ...p,
});

describe('alertes de stock', () => {
  it('rupture, stock bas, ok', () => {
    expect(stockLevel({ quantity: 0, target: 2 })).toBe('out');
    expect(stockLevel({ quantity: 1, target: 2 })).toBe('low');
    expect(stockLevel({ quantity: 2, target: 2 })).toBe('ok');
    expect(stockLevel({ quantity: 1, target: 0 })).toBe('ok');
  });
});

describe('péremption', () => {
  it('compte les jours au calendrier', () => {
    expect(daysUntil('2026-11-10', NOW)).toBe(0);
    expect(daysUntil('2026-11-11', NOW)).toBe(1);
    expect(daysUntil('2026-11-01', NOW)).toBe(-9);
  });
  it('classe périmé / bientôt / ok', () => {
    expect(expiryState('2026-11-09', NOW)).toBe('expired');
    expect(expiryState('2026-11-20', NOW)).toBe('soon');
    expect(expiryState('2027-01-01', NOW)).toBe('ok');
    expect(expiryState(undefined, NOW)).toBe('ok');
  });
  it('ignore les références épuisées', () => {
    const i = item({ variants: [variant({ id: 'x', expiry: '2026-11-12', quantity: 0 }), variant({ id: 'y', expiry: '2026-12-01' })] });
    expect(nextExpiry(i)).toBe('2026-12-01');
  });
});

describe('vin', () => {
  it('période de dégustation', () => {
    expect(drinkWindow({ drinkFrom: 2028 }, 2026)).toBe('wait');
    expect(drinkWindow({ drinkFrom: 2024, drinkUntil: 2030 }, 2026)).toBe('ready');
    expect(drinkWindow({ drinkUntil: 2025 }, 2026)).toBe('past');
    expect(drinkWindow({ vintage: 2020 }, 2026)).toBeUndefined();
  });
});

describe('prévision de rupture', () => {
  it('moyenne sur la période observée', () => {
    const history = [mv({ at: NOW - 30 * day, delta: -3 }), mv({ at: NOW - 10 * day, delta: -3 })];
    const f = forecast(item({ variants: [variant({ quantity: 4 })] }), history, NOW)!;
    expect(f.perMonth).toBeCloseTo(6);
    expect(f.daysLeft).toBeCloseTo(20);
    expect(suggestedTarget(f.perMonth)).toBe(3);
  });
  it('pas de prévision sans assez de données', () => {
    expect(forecast(item(), [mv({ at: NOW - 2 * day, delta: -5 })], NOW)).toBeNull();
    expect(forecast(item(), [mv({ at: NOW - 30 * day, delta: -1 })], NOW)).toBeNull();
  });
  it('ignore suppressions, inventaires et autres articles', () => {
    const history = [
      mv({ at: NOW - 30 * day, delta: -10, reason: 'suppression' }),
      mv({ at: NOW - 20 * day, delta: -10, reason: 'inventaire' }),
      mv({ at: NOW - 20 * day, delta: -10, itemId: 'b' }),
    ];
    expect(forecast(item(), history, NOW)).toBeNull();
  });
});

describe('valeur du stock', () => {
  it('somme des références au prix connu', () => {
    const i = item({ variants: [variant({ id: 'x', price: 2.5, quantity: 4 }), variant({ id: 'y', quantity: 3 })] });
    expect(stockValue([i])).toEqual({ value: 10, priced: 1 });
  });
});

describe('sauvegarde', () => {
  it('aller-retour avec identifiants et historique', () => {
    const backup = makeBackup([item()], [mv({ id: 'm1' })]);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.items[0].id).toBe('a');
    expect(parsed.items[0].variants[0].quantity).toBe(3);
    expect(parsed.history).toHaveLength(1);
  });
  it('lit l’ancien format (tableau, quantité à plat)', () => {
    const parsed = parseBackup(JSON.stringify([{ name: 'Bière', quantity: 6, barcode: '123', target: 4 }]));
    expect(parsed.items[0].variants[0]).toMatchObject({ quantity: 6, barcode: '123' });
    expect(parsed.history).toEqual([]);
  });
  it('refuse un fichier étranger', () => {
    expect(() => parseBackup('{"foo":1}')).toThrow();
  });

  it('remplacer : efface tout et recrée avec les mêmes identifiants', () => {
    const plan = planRestore([item({ id: 'old' })], [{ ...item({ id: 'a' }) }], 'replace');
    expect(plan.deletes).toEqual(['old']);
    expect(plan.creates[0].id).toBe('a');
  });
  it('fusionner : pas de doublon par identifiant, code-barres ou nom', () => {
    const current = [
      item({ id: 'a' }),
      item({ id: 'b', name: 'Bière', variants: [variant({ barcode: '999' })] }),
      item({ id: 'c', name: 'Café' }),
    ];
    const incoming = [
      { ...item({ id: 'a', variants: [variant({ quantity: 9 })] }) },
      { ...item({ id: 'zz', name: 'Bière blonde', variants: [variant({ id: 'n', barcode: '999', quantity: 1 })] }) },
      { ...item({ name: 'CAFÉ ' }), id: undefined },
      { ...item({ id: 'new', name: 'Thé' }) },
    ];
    const plan = planRestore(current, incoming, 'merge');
    expect(plan.deletes).toEqual([]);
    expect(plan.updates.map((u) => u.id).sort()).toEqual(['a', 'b', 'c']);
    expect(plan.updates.find((u) => u.id === 'a')!.input.variants[0].quantity).toBe(9);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0].id).toBe('new');
  });
  it('fusionner : garde les références actuelles absentes de la sauvegarde', () => {
    const current = [item({ variants: [variant({ id: 'v1', barcode: '1' }), variant({ id: 'v2', barcode: '2' })] })];
    const plan = planRestore(current, [item({ variants: [variant({ id: 'v1', barcode: '1', quantity: 5 })] })], 'merge');
    expect(plan.updates[0].input.variants.map((v) => v.id)).toEqual(['v1', 'v2']);
  });
});

describe('export tableur', () => {
  it('échappe les séparateurs et guillemets', () => {
    expect(toCsv([['a;b', 'c"d', 'e']])).toBe('﻿"a;b";"c""d";e');
  });
  it('une ligne par référence', () => {
    const csv = inventoryCsv([item({ variants: [variant({ id: 'x', label: 'Pago', price: 1.5 }), variant({ id: 'y', label: 'Innocent' })] })]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Pago');
    expect(lines[1]).toContain('1,5');
  });
});
