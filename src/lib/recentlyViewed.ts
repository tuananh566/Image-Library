const RECENTLY_VIEWED_KEY = 'khoanh_recently_viewed_v1';
const MAX_RECENT_ITEMS = 100;

export function readRecentlyViewedIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      const id =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
            ? (item as { id: string }).id
            : '';
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
        if (out.length >= MAX_RECENT_ITEMS) break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function writeRecentlyViewedIds(ids: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (id && !seen.has(id)) {
      seen.add(id);
      deduped.push(id);
      if (deduped.length >= MAX_RECENT_ITEMS) break;
    }
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(deduped));
    } catch {
      // Ignore storage quota or private mode errors
    }
  }
  return deduped;
}

export function recordRecentlyViewedId(id: string): string[] {
  if (!id) return readRecentlyViewedIds();
  const current = readRecentlyViewedIds();
  const next = [id, ...current.filter((item) => item !== id)].slice(0, MAX_RECENT_ITEMS);
  return writeRecentlyViewedIds(next);
}

export function clearRecentlyViewedIds(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECENTLY_VIEWED_KEY);
  } catch {
    // Ignore storage errors
  }
}
