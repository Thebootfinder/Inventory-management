/** Petites préférences propres à ce téléphone (jamais synchronisées). */
const BACKUP_KEY = 'cellier.lastBackup';

export function markBackup() {
  try {
    localStorage.setItem(BACKUP_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Jours depuis le dernier export depuis ce téléphone, ou null s'il n'y en a jamais eu. */
export function daysSinceBackup(now = Date.now()): number | null {
  try {
    const t = Number(localStorage.getItem(BACKUP_KEY));
    return t ? Math.floor((now - t) / 864e5) : null;
  } catch {
    return null;
  }
}
