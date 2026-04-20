import { useCallback, useEffect, useState } from 'react';

const LS_PREFIX = 'bookmarks_';

/** Per-paper bookmark set, persisted to localStorage. */
export function useBookmarks(paperId: string | undefined) {
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!paperId) { setBookmarks(new Set()); return; }
    try {
      const raw = localStorage.getItem(LS_PREFIX + paperId);
      const arr = raw ? (JSON.parse(raw) as number[]) : [];
      setBookmarks(new Set(arr));
    } catch {
      setBookmarks(new Set());
    }
  }, [paperId]);

  const persist = useCallback((next: Set<number>) => {
    if (!paperId) return;
    try {
      localStorage.setItem(LS_PREFIX + paperId, JSON.stringify([...next].sort((a, b) => a - b)));
    } catch { /* ignore */ }
  }, [paperId]);

  const toggle = useCallback((page: number) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page); else next.add(page);
      persist(next);
      return next;
    });
  }, [persist]);

  return { bookmarks, toggle, has: useCallback((p: number) => bookmarks.has(p), [bookmarks]) };
}
