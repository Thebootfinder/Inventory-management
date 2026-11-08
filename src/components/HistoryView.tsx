import { useMemo, useState } from 'react';
import type { Movement } from '../types';
import { Icon } from './Icon';

const monthKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string, style: 'short' | 'long' = 'short') => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' });
};
const dayLabel = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Aujourd’hui';
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
const time = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Une sortie de stock « consommée » (une suppression d'article n'est pas une consommation). */
const isConsumption = (m: Movement) => m.delta < 0 && m.reason !== 'suppression';

const REASON: Record<Movement['reason'], string> = {
  scan: 'scan',
  manuel: 'à la main',
  courses: 'courses',
  création: 'nouvel article',
  suppression: 'article supprimé',
};

export function HistoryView({ movements, itemId }: { movements: Movement[] | null; itemId?: string }) {
  const [filter, setFilter] = useState<'all' | 'out' | 'in'>('all');
  const [month, setMonth] = useState(() => monthKey(Date.now()));
  const [shown, setShown] = useState(itemId ? 10 : 60);

  const list = useMemo(() => (movements ?? []).filter((m) => !itemId || m.itemId === itemId), [movements, itemId]);

  // Consommation des 6 derniers mois.
  const months = useMemo(() => {
    const now = new Date();
    const keys = Array.from({ length: 6 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + i, 1).getTime()));
    const out: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const m of list) if (isConsumption(m) && m.at && monthKey(m.at) in out) out[monthKey(m.at)] += -m.delta;
    return keys.map((k) => ({ key: k, value: out[k] }));
  }, [list]);
  const max = Math.max(1, ...months.map((m) => m.value));

  const monthStats = useMemo(() => {
    const inMonth = list.filter((m) => monthKey(m.at) === month);
    const consumed = new Map<string, { name: string; qty: number }>();
    let outQty = 0;
    let inQty = 0;
    for (const m of inMonth) {
      if (isConsumption(m)) {
        outQty += -m.delta;
        const c = consumed.get(m.itemId) ?? { name: m.itemName, qty: 0 };
        c.qty += -m.delta;
        consumed.set(m.itemId, c);
      } else if (m.delta > 0) inQty += m.delta;
    }
    return { outQty, inQty, top: [...consumed.values()].sort((a, b) => b.qty - a.qty).slice(0, 5) };
  }, [list, month]);

  const journal = list.filter((m) => (filter === 'all' ? true : filter === 'out' ? m.delta < 0 : m.delta > 0));
  const groups: { day: string; rows: Movement[] }[] = [];
  for (const m of journal.slice(0, shown)) {
    const day = dayLabel(m.at);
    if (groups.at(-1)?.day !== day) groups.push({ day, rows: [] });
    groups.at(-1)!.rows.push(m);
  }

  if (movements === null) return <ul className="list">{[0, 1, 2].map((i) => <li key={i} className="row skeleton" />)}</ul>;

  return (
    <section className="history">
      {!itemId && (
        <>
          <div className="section-head">
            <h2>Historique</h2>
          </div>

          <div className="card chart-card">
            <div className="chart-head">
              <span className="muted">Consommation par mois</span>
              <strong>{monthLabel(month, 'long')}</strong>
            </div>
            <div className="chart" role="list">
              {months.map((m) => (
                <button
                  key={m.key}
                  role="listitem"
                  className={`chart-col${m.key === month ? ' on' : ''}`}
                  onClick={() => setMonth(m.key)}
                  aria-label={`${monthLabel(m.key, 'long')} : ${m.value} sorties`}
                >
                  <span className="chart-val">{m.value || ''}</span>
                  <span className="chart-bar" style={{ height: `${Math.max(4, (m.value / max) * 100)}%` }} />
                  <span className="chart-lbl">{monthLabel(m.key)}</span>
                </button>
              ))}
            </div>
            <div className="month-stats">
              <div>
                <strong className="out-text">−{monthStats.outQty}</strong>
                <span className="muted">sorties</span>
              </div>
              <div>
                <strong className="in-text">+{monthStats.inQty}</strong>
                <span className="muted">entrées</span>
              </div>
            </div>
            {monthStats.top.length > 0 && (
              <ol className="top-list">
                {monthStats.top.map((t) => (
                  <li key={t.name}>
                    <span>{t.name}</span>
                    <b>{t.qty}</b>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="chips">
            {(
              [
                ['all', 'Tout'],
                ['out', 'Sorties'],
                ['in', 'Entrées'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}

      {groups.length ? (
        groups.map((g) => (
          <div key={g.day} className="day">
            {!itemId && <h4>{g.day}</h4>}
            <ul>
              {g.rows.map((m) => (
                <li key={m.id} className="mv">
                  <span className={`mv-delta ${m.delta > 0 ? 'in' : 'out'}`}>
                    {m.delta > 0 ? '+' : '−'}
                    {Math.abs(m.delta)}
                  </span>
                  <div className="row-text">
                    <div className="mv-name">
                      {itemId ? m.variantLabel || m.itemName : m.itemName}
                      {!itemId && m.variantLabel && <span className="muted"> · {m.variantLabel}</span>}
                    </div>
                    <div className="row-meta">
                      <span>{itemId ? `${dayLabel(m.at)} ${time(m.at)}` : time(m.at)}</span>
                      <span>· {m.by}</span>
                      <span>· {REASON[m.reason]}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className="empty">
          <div className="empty-art">
            <Icon name="clock" size={30} />
          </div>
          <h3>Pas encore de mouvement</h3>
          <p>Chaque ajout ou retrait apparaîtra ici, avec qui l’a fait et quand.</p>
        </div>
      )}
      {journal.length > shown && (
        <button className="btn small ghost add-ref" onClick={() => setShown((n) => n + 100)}>
          Voir plus
        </button>
      )}
    </section>
  );
}
